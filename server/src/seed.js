import dotenv from 'dotenv';
dotenv.config();

import sequelize from './config/database.js';
import { User, Product, Category, Setting } from './models/index.js';

const products = [
  // Electronics
  {
    name: 'Wireless Bluetooth Headphones',
    slug: 'wireless-bluetooth-headphones',
    description: 'Premium noise-cancelling wireless headphones with 30-hour battery life, deep bass, and crystal-clear audio. Features active noise cancellation, comfortable memory foam ear cushions, and foldable design for easy travel.',
    price: 79.99, comparePrice: 129.99,
    category: 'Electronics', brand: 'SoundMax', stock: 50,
    images: [], featured: true, ratings: 4.5, numReviews: 128,
  },
  {
    name: 'Smart Watch Pro',
    slug: 'smart-watch-pro',
    description: 'Advanced fitness tracker with heart rate monitor, GPS, sleep tracking, and 7-day battery. Water resistant up to 50 meters. Features blood oxygen monitoring and stress tracking.',
    price: 199.99, comparePrice: 249.99,
    category: 'Electronics', brand: 'TechFit', stock: 30,
    images: [], featured: true, ratings: 4.3, numReviews: 89,
  },
  {
    name: 'Wireless Charging Pad',
    slug: 'wireless-charging-pad',
    description: 'Fast wireless charger compatible with all Qi-enabled devices. Sleek aluminum design with LED indicator and intelligent overheat protection. Charges through cases up to 8mm thick.',
    price: 19.99, comparePrice: 29.99,
    category: 'Electronics', brand: 'ChargeTech', stock: 120,
    images: [], featured: false, ratings: 4.1, numReviews: 234,
  },
  {
    name: 'Portable Bluetooth Speaker',
    slug: 'portable-bluetooth-speaker',
    description: 'Compact waterproof speaker with 360-degree immersive sound. 12-hour playtime, built-in microphone for hands-free calls. IPX7 rated for pool and beach use.',
    price: 59.99, comparePrice: 79.99,
    category: 'Electronics', brand: 'SoundMax', stock: 80,
    images: [], featured: true, ratings: 4.6, numReviews: 312,
  },
  {
    name: 'USB-C Hub Adapter',
    slug: 'usb-c-hub-adapter',
    description: '7-in-1 USB-C hub with HDMI 4K output, 3x USB 3.0, SD/TF card reader, and 100W Power Delivery pass-through. Aluminum alloy body with advanced heat dissipation.',
    price: 34.99, comparePrice: 49.99,
    category: 'Electronics', brand: 'TechFit', stock: 90,
    images: [], featured: false, ratings: 4.4, numReviews: 156,
  },
  {
    name: 'Noise Cancelling Earbuds',
    slug: 'noise-cancelling-earbuds',
    description: 'True wireless earbuds with hybrid active noise cancellation. Hi-Res audio certified, 8-hour battery life with 32 hours total with charging case. Touch controls and voice assistant support.',
    price: 89.99, comparePrice: 119.99,
    category: 'Electronics', brand: 'SoundMax', stock: 65,
    images: [], featured: true, ratings: 4.7, numReviews: 445,
  },
  {
    name: 'Mechanical Keyboard',
    slug: 'mechanical-keyboard',
    description: 'Compact 75% mechanical keyboard with hot-swappable switches, RGB backlighting, and wireless Bluetooth connectivity. PBT keycaps with a premium typing feel.',
    price: 69.99, comparePrice: 99.99,
    category: 'Electronics', brand: 'ChargeTech', stock: 40,
    images: [], featured: false, ratings: 4.8, numReviews: 267,
  },

  // Clothing
  {
    name: 'Organic Cotton T-Shirt',
    slug: 'organic-cotton-tshirt',
    description: '100% organic cotton, sustainably sourced and GOTS certified. Comfortable relaxed fit with a modern design. Pre-washed for extra softness. Available in multiple colors.',
    price: 29.99, comparePrice: 39.99,
    category: 'Clothing', brand: 'EcoWear', stock: 100,
    images: [], featured: true, ratings: 4.2, numReviews: 78,
  },
  {
    name: 'Denim Jacket Classic',
    slug: 'denim-jacket-classic',
    description: 'Timeless denim jacket with a modern slim fit. Made from premium 12oz cotton denim with copper button detailing, reinforced stitching, and adjustable waist tabs.',
    price: 69.99, comparePrice: 89.99,
    category: 'Clothing', brand: 'DenimCo', stock: 35,
    images: [], featured: false, ratings: 4.4, numReviews: 112,
  },
  {
    name: 'Merino Wool Sweater',
    slug: 'merino-wool-sweater',
    description: 'Luxuriously soft merino wool crewneck sweater. Naturally temperature-regulating, breathable, and odor-resistant. Perfect for layering in any season.',
    price: 89.99, comparePrice: 119.99,
    category: 'Clothing', brand: 'EcoWear', stock: 45,
    images: [], featured: true, ratings: 4.6, numReviews: 93,
  },
  {
    name: 'Linen Blend Shirt',
    slug: 'linen-blend-shirt',
    description: 'Relaxed-fit button-down in a premium linen-cotton blend. Breathable and lightweight, perfect for warm weather. Mother-of-pearl buttons and a curved hem.',
    price: 49.99, comparePrice: 64.99,
    category: 'Clothing', brand: 'EcoWear', stock: 60,
    images: [], featured: false, ratings: 4.3, numReviews: 67,
  },
  {
    name: 'Chino Pants Slim Fit',
    slug: 'chino-pants-slim-fit',
    description: 'Tailored slim-fit chinos in stretch cotton twill. Features a comfortable mid-rise waist, hidden security pocket, and wrinkle-resistant fabric for all-day wear.',
    price: 54.99, comparePrice: 74.99,
    category: 'Clothing', brand: 'DenimCo', stock: 55,
    images: [], featured: false, ratings: 4.1, numReviews: 145,
  },

  // Footwear
  {
    name: 'Running Shoes Ultra',
    slug: 'running-shoes-ultra',
    description: 'Lightweight running shoes with responsive ZoomFoam cushioning and breathable engineered mesh upper. Ideal for daily training and long-distance races. Weighs only 245g.',
    price: 119.99, comparePrice: 159.99,
    category: 'Footwear', brand: 'SpeedRun', stock: 45,
    images: [], featured: true, ratings: 4.5, numReviews: 203,
  },
  {
    name: 'Leather Chelsea Boots',
    slug: 'leather-chelsea-boots',
    description: 'Handcrafted full-grain leather Chelsea boots with Goodyear welt construction. Features elastic side panels, pull tab, and natural rubber sole. Built to last years.',
    price: 149.99, comparePrice: 199.99,
    category: 'Footwear', brand: 'SpeedRun', stock: 25,
    images: [], featured: true, ratings: 4.7, numReviews: 178,
  },
  {
    name: 'Canvas Sneakers',
    slug: 'canvas-sneakers',
    description: 'Classic low-top canvas sneakers with vulcanized rubber sole. Organic cotton upper, cushioned insole, and reinforced toe cap. A timeless everyday essential.',
    price: 44.99, comparePrice: 59.99,
    category: 'Footwear', brand: 'SpeedRun', stock: 80,
    images: [], featured: false, ratings: 4.2, numReviews: 324,
  },

  // Accessories
  {
    name: 'Stainless Steel Water Bottle',
    slug: 'stainless-steel-water-bottle',
    description: 'Double-walled vacuum insulated bottle keeps drinks cold for 24 hours or hot for 12. BPA-free, eco-friendly, and leak-proof. 750ml capacity in a sleek matte finish.',
    price: 24.99, comparePrice: 34.99,
    category: 'Accessories', brand: 'HydroLife', stock: 200,
    images: [], featured: false, ratings: 4.3, numReviews: 412,
  },
  {
    name: 'Laptop Backpack',
    slug: 'laptop-backpack',
    description: 'Durable laptop backpack with USB charging port, anti-theft hidden zipper design, and water-resistant 600D polyester. Fits up to 15.6" laptops with dedicated padded compartment.',
    price: 49.99, comparePrice: 69.99,
    category: 'Accessories', brand: 'UrbanPack', stock: 75,
    images: [], featured: true, ratings: 4.4, numReviews: 189,
  },
  {
    name: 'Leather Wallet RFID',
    slug: 'leather-wallet-rfid',
    description: 'Slim bifold wallet in genuine Italian leather with RFID-blocking technology. Features 8 card slots, 2 bill compartments, and ID window. Gift boxed.',
    price: 39.99, comparePrice: 54.99,
    category: 'Accessories', brand: 'UrbanPack', stock: 95,
    images: [], featured: false, ratings: 4.6, numReviews: 256,
  },
  {
    name: 'Polarized Sunglasses',
    slug: 'polarized-sunglasses',
    description: 'Premium polarized sunglasses with UV400 protection. Lightweight acetate frame with anti-scratch coating. Includes hard case and microfiber cleaning cloth.',
    price: 59.99, comparePrice: 79.99,
    category: 'Accessories', brand: 'UrbanPack', stock: 65,
    images: [], featured: true, ratings: 4.5, numReviews: 134,
  },
  {
    name: 'Minimalist Watch',
    slug: 'minimalist-watch',
    description: 'Clean dial analog watch with Japanese quartz movement. 40mm stainless steel case, sapphire crystal glass, and interchangeable genuine leather strap. 5ATM water resistant.',
    price: 79.99, comparePrice: 109.99,
    category: 'Accessories', brand: 'TechFit', stock: 30,
    images: [], featured: true, ratings: 4.8, numReviews: 87,
  },

  // Sports
  {
    name: 'Yoga Mat Premium',
    slug: 'yoga-mat-premium',
    description: 'Extra thick 6mm non-slip yoga mat with laser-etched alignment lines. Made from eco-friendly TPE material, free of PVC, latex, and toxic chemicals. Includes carrying strap.',
    price: 39.99, comparePrice: 59.99,
    category: 'Sports', brand: 'ZenFlex', stock: 60,
    images: [], featured: false, ratings: 4.5, numReviews: 178,
  },
  {
    name: 'Resistance Bands Set',
    slug: 'resistance-bands-set',
    description: 'Set of 5 natural latex resistance bands (10-50 lbs) with door anchor, ankle straps, and carrying bag. Perfect for home workouts, physical therapy, and stretching.',
    price: 24.99, comparePrice: 39.99,
    category: 'Sports', brand: 'ZenFlex', stock: 150,
    images: [], featured: false, ratings: 4.3, numReviews: 289,
  },
  {
    name: 'Foam Roller Pro',
    slug: 'foam-roller-pro',
    description: 'High-density EVA foam roller with textured surface for deep tissue massage. 18-inch length ideal for back, legs, and full-body recovery. Includes exercise guide.',
    price: 29.99, comparePrice: 44.99,
    category: 'Sports', brand: 'ZenFlex', stock: 70,
    images: [], featured: false, ratings: 4.4, numReviews: 198,
  },
  {
    name: 'Jump Rope Speed',
    slug: 'jump-rope-speed',
    description: 'Adjustable speed jump rope with ball bearing handles for smooth rotation. Tangle-free steel cable with PVC coating. Perfect for cardio, crossfit, and boxing training.',
    price: 14.99, comparePrice: 24.99,
    category: 'Sports', brand: 'ZenFlex', stock: 120,
    images: [], featured: false, ratings: 4.2, numReviews: 167,
  },

  // Home
  {
    name: 'Ceramic Coffee Mug Set',
    slug: 'ceramic-coffee-mug-set',
    description: 'Set of 4 handcrafted ceramic mugs in earthy tones. Microwave and dishwasher safe. 12oz capacity with comfortable handle. Reactive glaze finish makes each piece unique.',
    price: 34.99, comparePrice: 44.99,
    category: 'Home', brand: 'CraftHome', stock: 40,
    images: [], featured: false, ratings: 4.6, numReviews: 145,
  },
  {
    name: 'LED Desk Lamp',
    slug: 'led-desk-lamp',
    description: 'Adjustable LED desk lamp with 5 brightness levels and 3 color temperatures. Built-in USB charging port, 45-minute auto-off timer, and touch-sensitive controls.',
    price: 44.99, comparePrice: 59.99,
    category: 'Home', brand: 'BrightWork', stock: 55,
    images: [], featured: true, ratings: 4.5, numReviews: 112,
  },
  {
    name: 'Scented Candle Collection',
    slug: 'scented-candle-collection',
    description: 'Set of 3 hand-poured soy wax candles in artisan glass jars. Scents include Vanilla Bourbon, Cedar & Sage, and Ocean Breeze. 45-hour burn time each.',
    price: 42.99, comparePrice: 54.99,
    category: 'Home', brand: 'CraftHome', stock: 85,
    images: [], featured: false, ratings: 4.7, numReviews: 203,
  },
  {
    name: 'Throw Blanket Knit',
    slug: 'throw-blanket-knit',
    description: 'Chunky knit throw blanket in organic cotton. Generous 50"x60" size perfect for the couch or bed. Machine washable with a buttery-soft hand feel.',
    price: 59.99, comparePrice: 79.99,
    category: 'Home', brand: 'CraftHome', stock: 35,
    images: [], featured: true, ratings: 4.8, numReviews: 97,
  },
  {
    name: 'Plant Pot Set Ceramic',
    slug: 'plant-pot-set-ceramic',
    description: 'Set of 3 modern ceramic planters with bamboo saucers. Drainage holes for healthy plants. Matte finish in white, sage, and terracotta. Sizes: 4", 5", and 6".',
    price: 32.99, comparePrice: 44.99,
    category: 'Home', brand: 'CraftHome', stock: 50,
    images: [], featured: false, ratings: 4.4, numReviews: 156,
  },
  {
    name: 'Wall Clock Minimal',
    slug: 'wall-clock-minimal',
    description: 'Scandinavian-inspired 12-inch wall clock with silent sweep movement. Solid wood frame in natural oak finish with clean sans-serif numerals. Runs on 1 AA battery.',
    price: 38.99, comparePrice: 49.99,
    category: 'Home', brand: 'BrightWork', stock: 42,
    images: [], featured: false, ratings: 4.3, numReviews: 88,
  },
];

const seed = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });

    await User.create({
      name: 'Admin',
      email: 'admin@store.com',
      password: 'admin123',
      role: 'admin',
    });

    await User.create({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'password123',
      role: 'customer',
    });

    await Product.bulkCreate(products);

    // Categories — derived from the product set so the storefront nav/filters populate.
    const categoryNames = [...new Set(products.map((p) => p.category).filter(Boolean))];
    await Category.bulkCreate(categoryNames.map((name, i) => ({ name, sortOrder: i + 1, active: true })));

    // Announcement bar messages (editable later in Admin → Settings).
    await Setting.upsert({
      key: 'announcements',
      value: JSON.stringify(['New arrivals live now', 'Free delivery across the UAE', 'Easy 14-day returns']),
    });

    console.log(`Database seeded with ${products.length} products and ${categoryNames.length} categories!`);
    console.log('Admin: admin@store.com / admin123');
    console.log('Customer: john@example.com / password123');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
};

seed();
