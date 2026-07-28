import { createContext, useContext, useState, useEffect } from 'react';

const RecentlyViewedContext = createContext();

export const useRecentlyViewed = () => useContext(RecentlyViewedContext);

const MAX_ITEMS = 12;

export function RecentlyViewedProvider({ children }) {
  const [viewed, setViewed] = useState(() => {
    const saved = localStorage.getItem('recently-viewed');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('recently-viewed', JSON.stringify(viewed));
  }, [viewed]);

  const addViewed = (product) => {
    setViewed((prev) => {
      const filtered = prev.filter((p) => p.id !== product.id);
      return [
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          comparePrice: product.comparePrice,
          category: product.category,
          images: product.images,
          ratings: product.ratings,
          numReviews: product.numReviews,
          variants: product.variants,
        },
        ...filtered,
      ].slice(0, MAX_ITEMS);
    });
  };

  return (
    <RecentlyViewedContext.Provider value={{ viewed, addViewed }}>
      {children}
    </RecentlyViewedContext.Provider>
  );
}
