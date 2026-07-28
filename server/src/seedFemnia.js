/**
 * Femnia catalogue seed — the fashion categories and products from the
 * storefront design.
 *
 * Replaces Products + Categories only. Users, settings, coupons and orders
 * are left untouched, so this is safe to re-run while iterating on the
 * storefront. Run with: npm run seed:femnia
 */
import sequelize from './config/database.js';
import { Product, Category } from './models/index.js';

const CATEGORIES = [
  { name: 'New In', nameAr: 'وصل حديثًا', sortOrder: 1 },
  { name: 'Dresses', nameAr: 'فساتين', sortOrder: 2 },
  { name: 'Tops', nameAr: 'بلوزات', sortOrder: 3 },
  { name: 'Accessories', nameAr: 'إكسسوارات', sortOrder: 4 },
  { name: 'Sale', nameAr: 'تخفيضات', sortOrder: 5 },
];

// `categories[0]` becomes the denormalized primary category (see the
// beforeValidate hook on the Product model).
const PRODUCTS = [
  // ── The four cards shown in the design. These are the only featured
  // products, so the home "New In" rail renders exactly that row of four.
  {
    name: 'Linen Blend Blazer',
    price: 119,
    categories: ['New In', 'Tops'],
    featured: true,
    description:
      'A relaxed single-breasted blazer in a breathable linen blend. Softly structured shoulders, notch lapels and a half-lined body that drapes without bulk.',
  },
  {
    name: 'Satin Cowl Top',
    price: 79,
    categories: ['New In', 'Tops'],
    featured: true,
    description:
      'Fluid satin with a draped cowl neckline and fine adjustable straps. Cut on the bias so it skims rather than clings.',
  },
  {
    name: 'Pleated Maxi Dress',
    price: 129,
    categories: ['New In', 'Dresses'],
    featured: true,
    description:
      'Column-pleated maxi in a soft crepe. A defined waist seam falls into a full, moving skirt that lengthens the line.',
  },
  {
    name: 'Tailored Co-ord Set',
    price: 139,
    categories: ['New In', 'Tops'],
    featured: true,
    description:
      'Matching blazer and wide-leg trouser in a fine twill. Wear as a suit or split the pieces back into the rest of your wardrobe.',
  },

  // ── Dresses
  {
    name: 'Silk Slip Dress',
    price: 149,
    categories: ['Dresses'],
    description: 'Pure silk with a bias cut and delicate bar-tacked straps. An easy evening piece that layers over a fine knit by day.',
  },
  {
    name: 'Wrap Midi Dress',
    price: 135,
    categories: ['Dresses'],
    description: 'A true wrap with a self-tie waist and a softly flared skirt. Adjustable through the body, so it moves with you.',
  },
  {
    name: 'Ribbed Knit Midi Dress',
    price: 99,
    categories: ['Dresses'],
    description: 'Fine-gauge rib that holds its shape, with a high neck and a long, lean skirt. Quietly elegant on its own.',
  },
  {
    name: 'Tiered Poplin Dress',
    price: 115,
    comparePrice: 165,
    categories: ['Dresses', 'Sale'],
    description: 'Crisp cotton poplin gathered into three soft tiers. Light enough for heat, structured enough to hold a line.',
  },

  // ── Tops
  {
    name: 'Oversized Poplin Shirt',
    price: 69,
    categories: ['Tops'],
    description: 'A generous cotton shirt with a dropped shoulder and a longline hem. Sharp collar, deliberately relaxed body.',
  },
  {
    name: 'Cashmere Crew Neck',
    price: 159,
    categories: ['Tops'],
    description: 'Two-ply cashmere knitted to a lightweight gauge. Ribbed neck, cuffs and hem keep the shape season after season.',
  },
  {
    name: 'Puff Sleeve Blouse',
    price: 85,
    categories: ['Tops'],
    description: 'Softly gathered sleeves and a covered placket in a fluid georgette. Volume where it counts, clean everywhere else.',
  },
  {
    name: 'Cropped Cotton Tee',
    price: 39,
    comparePrice: 59,
    categories: ['Tops', 'Sale'],
    description: 'Heavyweight organic cotton with a boxy crop and a rolled sleeve. The plain tee, properly cut.',
  },
  {
    name: 'Merino Wool Cardigan',
    price: 129,
    categories: ['Tops'],
    description: 'Extra-fine merino with tonal horn buttons and a straight, hip-length body. Warm without weight.',
  },

  // ── Accessories
  {
    name: 'Structured Leather Tote',
    price: 189,
    categories: ['Accessories'],
    description: 'Full-grain leather with a reinforced base and rolled top handles. Fits a laptop, a folder and the rest of it.',
  },
  {
    name: 'Cat-Eye Sunglasses',
    price: 95,
    categories: ['Accessories'],
    description: 'Hand-polished acetate in a soft cat-eye, with UV400 gradient lenses and sprung hinges.',
  },
  {
    name: 'Gold Hoop Earrings',
    price: 59,
    categories: ['Accessories'],
    description: '18k gold vermeil over sterling silver. Lightweight enough for every day, weighty enough to feel like something.',
  },
  {
    name: 'Woven Leather Belt',
    price: 65,
    categories: ['Accessories'],
    description: 'Hand-woven leather with a brushed brass buckle. Sits at the waist without stiffness.',
  },
  {
    name: 'Silk Twill Scarf',
    price: 75,
    comparePrice: 110,
    categories: ['Accessories', 'Sale'],
    description: 'Hand-rolled silk twill in a soft, painterly print. Wear it at the neck, in the hair or knotted to a bag.',
  },
  {
    name: 'Pointed Slingback Heels',
    price: 145,
    categories: ['Accessories'],
    description: 'A 65mm block heel with a pointed toe and a padded leather footbed. Refined, and genuinely walkable.',
  },
];

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const seed = async () => {
  try {
    await sequelize.authenticate();

    // Replace the catalogue only — never the users/settings/orders tables.
    await Product.destroy({ where: {} });
    await Category.destroy({ where: {} });

    await Category.bulkCreate(CATEGORIES);

    await Product.bulkCreate(
      PRODUCTS.map((p, i) => ({
        name: p.name,
        slug: slugify(p.name),
        code: `FEM-${String(i + 1).padStart(3, '0')}`,
        description: p.description,
        price: p.price,
        comparePrice: p.comparePrice ?? null,
        categories: p.categories,
        category: p.categories[0],
        brand: 'Femnia',
        stock: 25,
        images: [],
        featured: !!p.featured,
        active: true,
        variantOptions: { Size: ['XS', 'S', 'M', 'L', 'XL'] },
        variants: ['XS', 'S', 'M', 'L', 'XL'].map((size) => ({
          options: { Size: size },
          sku: `FEM-${String(i + 1).padStart(3, '0')}-${size}`,
          price: null,
          stock: 5,
        })),
      })),
      { validate: true },
    );

    const featured = PRODUCTS.filter((p) => p.featured).length;
    console.log(
      `Femnia catalogue seeded: ${PRODUCTS.length} products (${featured} featured) across ${CATEGORIES.length} categories.`,
    );
    console.log('Products have no images yet — upload them from Admin → Products.');
    process.exit(0);
  } catch (error) {
    console.error('Femnia seed failed:', error);
    process.exit(1);
  }
};

seed();
