import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Star, Minus, Plus, ArrowLeft, Zap, Heart, ShoppingBag, Share2, Link as LinkIcon, Check } from 'lucide-react';
import { FaFacebookF, FaXTwitter, FaWhatsapp } from 'react-icons/fa6';
import { useTranslation } from 'react-i18next';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useWishlist } from '../../context/WishlistContext';
import { useRecentlyViewed } from '../../context/RecentlyViewedContext';
import ProductImage from '../../components/ProductImage';
import EstimatedDelivery from '../../components/EstimatedDelivery';
import TamaraWidget from '../../components/TamaraWidget';
import SEO from '../../components/SEO';
import api from '../../api/axios';
import { showToast } from '../../utils/toast';
import { CURRENCY, CurrencySymbol, formatPrice } from '../../utils/currency';
import { localizedName, localizedDescription } from '../../utils/i18nHelpers';
import ProductCard from './ProductCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

function Stars({ value, size = 14 }) {
  return (
    <div className="flex text-amber-500">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={size} fill={value >= s ? 'currentColor' : 'none'} className={value >= s ? '' : 'text-muted-foreground/40'} />
      ))}
    </div>
  );
}

export default function ProductDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const { user } = useAuth();
  const { toggleWishlist, isInWishlist } = useWishlist();
  const { viewed, addViewed } = useRecentlyViewed();
  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    setLoading(true);
    setActiveImage(0);
    api.get(`/products/${slug}`)
      .then((res) => {
        setProduct(res.data);
        addViewed(res.data);
        if (res.data.variantOptions) {
          const defaults = {};
          Object.entries(res.data.variantOptions).forEach(([type, values]) => {
            defaults[type] = values[0];
          });
          setSelectedOptions(defaults);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    api.get(`/products/${slug}/related`)
      .then((res) => setRelatedProducts(res.data))
      .catch(() => {});
  }, [slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-2">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-24 text-center lg:px-8">
        <h2 className="font-serif text-4xl font-semibold text-foreground">This product no longer exists.</h2>
        <Button asChild className="mt-8">
          <Link to="/products">Back to products</Link>
        </Button>
      </div>
    );
  }

  const hasVariants = product.variants && product.variants.length > 0;
  const activeVariant = hasVariants
    ? product.variants.find((v) => Object.entries(selectedOptions).every(([k, val]) => v.options[k] === val))
    : null;

  const displayPrice = activeVariant?.price != null ? activeVariant.price : product.price;
  const displayStock = hasVariants ? (activeVariant?.stock ?? 0) : product.stock;
  const discount = product.comparePrice ? Math.round((1 - displayPrice / product.comparePrice) * 100) : 0;

  const handleAddToCart = () => addToCart(product, quantity, hasVariants ? selectedOptions : null);
  const handleBuyNow = () => {
    addToCart(product, quantity, hasVariants ? selectedOptions : null);
    navigate('/checkout');
  };

  const isOptionAvailable = (type, value) => {
    if (!hasVariants) return true;
    return product.variants.some((v) =>
      v.options[type] === value && v.stock > 0 &&
      Object.entries(selectedOptions).every(([k, sv]) => k === type || v.options[k] === sv),
    );
  };

  const url = typeof window !== 'undefined' ? window.location.href : '';
  const shareTitle = product.name || '';
  const u = encodeURIComponent(url);
  const tt = encodeURIComponent(shareTitle);
  const shares = [
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}`, icon: <FaFacebookF /> },
    { name: 'X', href: `https://twitter.com/intent/tweet?url=${u}&text=${tt}`, icon: <FaXTwitter /> },
    { name: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(shareTitle + ' ' + url)}`, icon: <FaWhatsapp /> },
  ];
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const descLines = (localizedDescription(product) || '').split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <SEO
        title={product.name}
        description={product.description?.slice(0, 160) || `${product.name} at ${CURRENCY}${formatPrice(displayPrice)}`}
        image={product.images?.[0] ? `${window.location.origin}${product.images[0]}` : undefined}
        type="product"
        product={{ ...product, price: displayPrice, stock: displayStock }}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Products', url: '/products' },
          ...(product.category ? [{ name: product.category, url: `/products?category=${encodeURIComponent(product.category)}` }] : []),
          { name: product.name, url: `/product/${product.slug}` },
        ]}
      />

      <Link to="/products" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to collection
      </Link>

      <div className="grid gap-10 lg:grid-cols-2">
        <Gallery
          images={product.images}
          product={product}
          activeImage={activeImage}
          setActiveImage={setActiveImage}
          discount={discount}
          inWishlist={isInWishlist(product.id)}
          onToggleWishlist={() => {
            toggleWishlist(product);
            showToast(isInWishlist(product.id) ? 'Removed from wishlist' : 'Added to wishlist');
          }}
        />

        {/* Info */}
        <div className="flex min-w-0 flex-col">
          {product.category && (
            <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{product.category}</span>
          )}
          <h1 className="mt-2 break-words font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {localizedName(product)}
          </h1>
          {product.brand && <p className="mt-1 text-sm text-muted-foreground">by {product.brand}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Stars value={Math.round(product.ratings || 0)} />
            <span className="font-medium">{product.ratings || '0.0'}</span>
            <span className="text-muted-foreground">· {product.numReviews} review{product.numReviews !== 1 ? 's' : ''}</span>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-3xl font-semibold text-foreground"><CurrencySymbol />{formatPrice(displayPrice)}</span>
            {product.comparePrice && (
              <span className="text-lg text-muted-foreground line-through"><CurrencySymbol />{formatPrice(product.comparePrice)}</span>
            )}
            {discount > 0 && <Badge>Save {discount}%</Badge>}
          </div>

          <TamaraWidget amount={displayPrice} className="mt-3" />

          {hasVariants && product.variantOptions && (
            <div className="mt-6 flex flex-col gap-5">
              {Object.entries(product.variantOptions).map(([type, values]) => {
                const isColor = type.toLowerCase() === 'color' || type.toLowerCase() === 'colour';
                return (
                  <div key={type}>
                    <Label className="mb-2 block text-sm">
                      {type} · <span className="font-semibold">{selectedOptions[type]}</span>
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {values.map((val) => {
                        const available = isOptionAvailable(type, val);
                        const active = selectedOptions[type] === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            disabled={!available}
                            title={val}
                            onClick={() => {
                              if (available) {
                                setSelectedOptions({ ...selectedOptions, [type]: val });
                                setQuantity(1);
                              }
                            }}
                            className={cn(
                              'flex min-w-10 items-center justify-center rounded-md border px-3 py-2 text-sm transition-colors',
                              active ? 'border-primary bg-primary/10 font-medium text-primary' : 'border-input hover:bg-accent',
                              !available && 'cursor-not-allowed opacity-40 line-through',
                            )}
                          >
                            {isColor ? (
                              <span className="size-5 rounded-full border" style={{ backgroundColor: val }} />
                            ) : val}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {activeVariant?.sku && <p className="text-xs text-muted-foreground">SKU · {activeVariant.sku}</p>}
            </div>
          )}

          {descLines.length > 1 ? (
            <ul className="mt-6 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {descLines.map((line, i) => <li key={i}>{line}</li>)}
            </ul>
          ) : (
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{descLines[0]}</p>
          )}

          <div className={cn('mt-6 text-sm font-medium', displayStock > 0 ? 'text-emerald-600' : 'text-destructive')}>
            {displayStock > 0 ? `In stock · ${displayStock} available` : 'Out of stock'}
          </div>

          {displayStock > 0 && <div className="mt-2"><EstimatedDelivery minDays={1} maxDays={3} skipFriday /></div>}

          {displayStock > 0 ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-md border border-input">
                <Button type="button" variant="ghost" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Decrease">
                  <Minus className="size-4" />
                </Button>
                <span className="w-10 text-center text-sm font-medium">{quantity}</span>
                <Button type="button" variant="ghost" size="icon" onClick={() => setQuantity(Math.min(displayStock, quantity + 1))} aria-label="Increase">
                  <Plus className="size-4" />
                </Button>
              </div>
              <Button type="button" variant="outline" size="lg" onClick={handleAddToCart} className="gap-2">
                <ShoppingBag className="size-4" /> Add to cart
              </Button>
              <Button type="button" size="lg" onClick={handleBuyNow} className="gap-2">
                <Zap className="size-4" /> Buy now
              </Button>
            </div>
          ) : (
            <Button type="button" size="lg" disabled className="mt-6 w-full sm:w-auto">Sold out</Button>
          )}

          <div className="mt-6">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                  <Share2 className="size-4" /> {t('product.shareProduct')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {shares.map((s) => (
                  <DropdownMenuItem key={s.name} asChild>
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className="gap-2">
                      <span className="flex size-5 items-center justify-center">{s.icon}</span> {s.name}
                    </a>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); copyLink(); }} className="gap-2">
                  <span className="flex size-5 items-center justify-center">
                    {linkCopied ? <Check className="size-3.5" /> : <LinkIcon className="size-3.5" />}
                  </span>
                  {linkCopied ? t('product.linkCopied') : t('product.copyLink')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Mobile sticky buy bar */}
      {displayStock > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-background/95 p-3 backdrop-blur lg:hidden">
          <span className="shrink-0 text-lg font-semibold"><CurrencySymbol />{formatPrice(displayPrice)}</span>
          <Button type="button" variant="outline" className="flex-1 gap-1.5" onClick={handleAddToCart}>
            <ShoppingBag className="size-4" /> Add
          </Button>
          <Button type="button" className="flex-1 gap-1.5" onClick={handleBuyNow}>
            <Zap className="size-4" /> Buy now
          </Button>
        </div>
      )}

      <ReviewsSection productId={product.id} user={user} />

      {relatedProducts.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 font-serif text-2xl font-semibold tracking-tight">You may also love</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {relatedProducts.slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}

      {viewed.filter((p) => p.id !== product.id).length > 0 && (
        <section className="mt-16 mb-20 lg:mb-0">
          <h2 className="mb-6 font-serif text-2xl font-semibold tracking-tight">Recently viewed</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {viewed.filter((p) => p.id !== product.id).slice(0, 4).map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Gallery({ images, product, activeImage, setActiveImage, discount, inWishlist, onToggleWishlist }) {
  const touchStart = useRef(null);
  const touchDelta = useRef(0);
  const imgCount = images?.length || 0;

  const onTouchStart = (e) => { touchStart.current = e.touches[0].clientX; touchDelta.current = 0; };
  const onTouchMove = (e) => { if (touchStart.current !== null) touchDelta.current = e.touches[0].clientX - touchStart.current; };
  const onTouchEnd = () => {
    if (Math.abs(touchDelta.current) > 50) {
      if (touchDelta.current < 0 && activeImage < imgCount - 1) setActiveImage(activeImage + 1);
      else if (touchDelta.current > 0 && activeImage > 0) setActiveImage(activeImage - 1);
    }
    touchStart.current = null;
    touchDelta.current = 0;
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex h-full transition-transform duration-300" style={{ transform: `translateX(-${activeImage * 100}%)` }}>
          {imgCount > 0 ? (
            images.map((url, i) => (
              <div key={i} className="size-full shrink-0">
                <img src={url} alt={`${product.name} ${i + 1}`} className="size-full object-cover" />
              </div>
            ))
          ) : (
            <div className="size-full shrink-0"><ProductImage product={product} size="large" /></div>
          )}
        </div>

        {discount > 0 && <Badge className="absolute left-3 top-3">−{discount}%</Badge>}

        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="absolute right-3 top-3 rounded-full shadow-sm"
          onClick={onToggleWishlist}
          aria-label="Toggle wishlist"
        >
          <Heart className={cn('size-[18px]', inWishlist && 'fill-destructive text-destructive')} />
        </Button>

        {imgCount > 1 && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveImage(i)}
                className={cn('h-1.5 rounded-full bg-foreground/30 transition-all', activeImage === i ? 'w-5 bg-foreground/80' : 'w-1.5')}
                aria-label={`Image ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>

      {imgCount > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActiveImage(i)}
              className={cn(
                'size-16 shrink-0 overflow-hidden rounded-md border-2 transition-colors',
                activeImage === i ? 'border-primary' : 'border-transparent hover:border-border',
              )}
            >
              <img src={url} alt={`${product.name} ${i + 1}`} className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewsSection({ productId, user }) {
  const [reviews, setReviews] = useState([]);
  const [breakdown, setBreakdown] = useState({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ rating: 5, title: '', comment: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchReviews = () => {
    api.get(`/reviews/product/${productId}?page=${page}&limit=5`)
      .then((res) => {
        setReviews(res.data.reviews);
        setBreakdown(res.data.breakdown);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      })
      .catch(console.error);
  };

  useEffect(() => { fetchReviews(); }, [productId, page]);

  const avgRating = total > 0
    ? (Object.entries(breakdown).reduce((sum, [r, c]) => sum + r * c, 0) / total).toFixed(1)
    : '0.0';
  const avgFloat = parseFloat(avgRating);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/reviews', { productId, ...formData });
      showToast('Review submitted');
      setShowForm(false);
      setFormData({ rating: 5, title: '', comment: '' });
      fetchReviews();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to submit review', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const avatarColor = (name) => {
    const h = [...(name || '?')].reduce((s, c) => s + c.charCodeAt(0), 0) % 360;
    return `hsl(${h}, 38%, 62%)`;
  };

  return (
    <section className="mt-16 border-t border-border pt-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Ratings &amp; reviews</h2>
        {user && (
          <Button type="button" variant="outline" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : 'Write a review'}
          </Button>
        )}
      </div>

      <div className="grid gap-8 rounded-lg border border-border bg-card p-6 sm:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center justify-center sm:border-r sm:border-border sm:pr-8">
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-semibold">{avgRating}</span>
            <span className="text-muted-foreground">/ 5</span>
          </div>
          <div className="mt-2"><Stars value={avgFloat} size={18} /></div>
          <span className="mt-2 text-xs text-muted-foreground">
            {total > 0 ? `Based on ${total} ${total === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}
          </span>
        </div>
        <div className="flex flex-col justify-center gap-2">
          {[5, 4, 3, 2, 1].map((r) => {
            const pct = total > 0 ? Math.round((breakdown[r] / total) * 100) : 0;
            return (
              <div key={r} className="flex items-center gap-3 text-sm">
                <span className="flex w-8 items-center gap-0.5 text-muted-foreground">{r}<Star size={11} fill="currentColor" strokeWidth={0} className="text-amber-500" /></span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-9 text-right text-muted-foreground">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {showForm && user && (
        <form className="mt-6 flex flex-col gap-4 rounded-lg border border-border p-6" onSubmit={handleSubmit}>
          <div>
            <Label className="mb-2 block">Rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" onClick={() => setFormData({ ...formData, rating: s })} aria-label={`${s} stars`}>
                  <Star size={24} className={formData.rating >= s ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/40'} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="review-title">Title (optional)</Label>
            <Input id="review-title" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Summarize your experience" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="review-comment">Your review</Label>
            <Textarea id="review-comment" value={formData.comment} onChange={(e) => setFormData({ ...formData, comment: e.target.value })} rows={4} required placeholder="What did you think?" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>{submitting ? 'Submitting…' : 'Submit review'}</Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}

      {reviews.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
          <Star className="size-7 text-muted-foreground/50" />
          <p className="font-medium">No reviews yet</p>
          <p className="text-sm text-muted-foreground">Be the first to share your experience.</p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          {reviews.map((review) => {
            const name = (review.name || 'Anonymous').trim();
            const initial = name.charAt(0).toUpperCase() || '?';
            return (
              <article key={review.id} className="rounded-lg border border-border p-5">
                <header className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: avatarColor(name) }}>
                    {initial}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(review.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  {review.verified && <Badge variant="secondary" className="ml-auto">Verified buyer</Badge>}
                </header>
                <div className="mt-3"><Stars value={review.rating} /></div>
                {review.title && <h4 className="mt-2 font-medium">{review.title}</h4>}
                <p className="mt-1 text-sm text-muted-foreground">{review.comment}</p>
              </article>
            );
          })}

          {totalPages > 1 && (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => (
                <Button key={i + 1} variant={page === i + 1 ? 'default' : 'outline'} size="icon" onClick={() => setPage(i + 1)}>
                  {i + 1}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
