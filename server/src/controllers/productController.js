import { Op } from 'sequelize';
import sequelize from '../config/database.js';
import { Product, syncProductStockFromForm } from '../models/index.js';

// Storefront visibility: active AND not flagged POS-only. Applied to every
// public-facing product query so a `hideOnline` product never leaks out.
export const STOREFRONT_WHERE = { active: true, hideOnline: false };

export const getProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      search,
      minPrice,
      maxPrice,
      sort = 'createdAt',
      order = 'DESC',
      featured,
    } = req.query;

    const where = { ...STOREFRONT_WHERE };
    const and = [];

    if (category) {
      // Match the primary `category` OR any entry in the `categories` array.
      // escape() embeds a safe SQL literal, e.g. JSON_CONTAINS(categories, '"Footwear"').
      const catJson = sequelize.escape(JSON.stringify(category));
      and.push({
        [Op.or]: [
          { category },
          sequelize.literal(`JSON_CONTAINS(categories, ${catJson})`),
        ],
      });
    }
    if (featured) where.featured = true;
    if (search) {
      and.push({
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } },
        ],
      });
    }
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = minPrice;
      if (maxPrice) where.price[Op.lte] = maxPrice;
    }
    if (and.length) where[Op.and] = and;

    const offset = (page - 1) * limit;
    const { count, rows } = await Product.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [[sort, order.toUpperCase()]],
    });

    res.json({
      products: rows,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      total: count,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProduct = async (req, res) => {
  try {
    const product = await Product.findOne({
      where: { slug: req.params.slug, ...STOREFRONT_WHERE },
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getCategories = async (req, res) => {
  try {
    // Union of every category any active product belongs to — primary plus the
    // `categories` array — so secondary memberships still show up as filters.
    const rows = await Product.findAll({
      attributes: ['category', 'categories'],
      where: { ...STOREFRONT_WHERE },
      raw: true,
    });
    const set = new Set();
    for (const r of rows) {
      if (r.category) set.add(r.category);
      let cats = r.categories;
      if (typeof cats === 'string') {
        try { cats = JSON.parse(cats); } catch { cats = []; }
      }
      if (Array.isArray(cats)) cats.forEach((c) => c && set.add(c));
    }
    res.json([...set].sort((a, b) => a.localeCompare(b)));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Admin
export const createProduct = async (req, res) => {
  try {
    const slug = req.body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const code = req.body.code?.trim() || null;
    const product = await Product.create({ ...req.body, slug, code });

    // Seed the per-location row so a new product is sellable at the till
    // immediately, rather than reading as zero stock until someone opens
    // Inventory and enters the same number again.
    const stockSync = await syncProductStockFromForm(product.id, req.body);
    await product.reload();
    res.status(201).json({ ...product.toJSON(), stockSync });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (req.body.name && req.body.name !== product.name) {
      req.body.slug = req.body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    }

    if ('code' in req.body) {
      req.body.code = req.body.code?.trim() || null;
    }

    await product.update(req.body);

    // Mirror the typed figure into per-location stock. Without this the
    // number is a derived rollup that the next ERP action overwrites.
    const stockSync = await syncProductStockFromForm(product.id, req.body);
    await product.reload();
    res.json({ ...product.toJSON(), stockSync });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await product.destroy();
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
