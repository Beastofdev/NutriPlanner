import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, resolveImageUrl } from '../services/api';
// No BottomNav — this is a public page inside PublicLayout

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SUPERMARKET_META = {
    MERCADONA: {
        label: 'Mercadona',
        color: '#00A650',
        bgClass: 'bg-[#00A650]',
        lightBg: 'bg-[#00A650]/10',
        textColor: 'text-[#00A650]',
    },
    CONSUM: {
        label: 'Consum',
        color: '#E8611A',
        bgClass: 'bg-[#E8611A]',
        lightBg: 'bg-[#E8611A]/10',
        textColor: 'text-[#E8611A]',
    },
};

const PRODUCTS_PER_PAGE = 24;

const PLACEHOLDER_ICON = 'local_grocery_store';

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function ProductCardSkeleton() {
    return (
        <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="h-28 w-full skeleton-shimmer" />
            <div className="p-3 flex flex-col gap-2">
                <div className="h-3.5 w-3/4 skeleton-shimmer rounded-full" />
                <div className="h-3 w-1/2 skeleton-shimmer rounded-full" />
                <div className="h-3 w-1/3 skeleton-shimmer rounded-full" />
                <div className="mt-1 flex items-center justify-between">
                    <div className="h-5 w-16 skeleton-shimmer rounded-full" />
                    <div className="h-5 w-20 skeleton-shimmer rounded-lg" />
                </div>
            </div>
        </div>
    );
}

function GridSkeleton({ count = 12 }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: count }).map((_, i) => (
                <ProductCardSkeleton key={i} />
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// ProductCard
// ---------------------------------------------------------------------------

function ProductCard({ product }) {
    const [imgError, setImgError] = useState(false);
    const superMeta = SUPERMARKET_META[product.supermarket] ?? null;
    // Only show offer if discount is realistic (<60%) and original_price isn't PUM
    const rawOffer = product.is_on_offer && product.original_price != null && product.original_price > product.price;
    const hasOffer = rawOffer && product.discount_percentage != null && product.discount_percentage <= 60 && product.original_price <= product.price * 5;

    const imageUrl = resolveImageUrl(product.image_url);

    return (
        <div className="glass-panel rounded-2xl overflow-hidden hover:shadow-[var(--shadow-elevated)] transition-all duration-300 flex flex-col">
            {/* Image area */}
            <div className="relative h-28 w-full bg-gradient-to-b from-[var(--color-primary-light)] to-[var(--color-bg-page)] flex items-center justify-center shrink-0">
                {imageUrl && !imgError ? (
                    <img
                        src={imageUrl}
                        alt={product.product_name}
                        className="w-16 h-16 object-contain"
                        loading="lazy"
                        onError={() => setImgError(true)}
                    />
                ) : (
                    <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold"
                        style={{ background: superMeta?.color ?? 'var(--color-primary)', opacity: 0.85 }}
                    >
                        {(product.product_name || '?')[0].toUpperCase()}
                    </div>
                )}

                {/* Supermarket badge */}
                {superMeta && (
                    <span
                        className="absolute top-2 left-2 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                        style={{ backgroundColor: superMeta.color }}
                    >
                        {superMeta.label}
                    </span>
                )}

                {/* Offer badge */}
                {hasOffer && (
                    <span className="absolute top-2 right-2 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md">
                        -{Math.round(product.discount_percentage ?? 0)}%
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="p-3 flex flex-col gap-1 flex-1">
                <p
                    className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug line-clamp-2"
                    style={{ fontFamily: 'var(--font-body)' }}
                >
                    {product.product_name}
                </p>

                {product.brand && (
                    <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                        {product.brand}
                    </p>
                )}

                {product.format && (
                    <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                        {product.format}
                    </p>
                )}

                {/* Price row */}
                <div className="mt-auto pt-2 flex items-end justify-between gap-2">
                    <div className="flex flex-col">
                        <span
                            className="text-base font-bold"
                            style={{ color: superMeta?.color ?? 'var(--color-text-primary)' }}
                        >
                            {product.price != null ? `${Number(product.price).toFixed(2)} €` : '—'}
                        </span>
                        {hasOffer && (
                            <span className="text-[10px] text-[var(--color-text-muted)] line-through">
                                {Number(product.original_price).toFixed(2)} €
                            </span>
                        )}
                    </div>

                    {product.pum && (
                        <span className="text-[10px] text-[var(--color-text-muted)] text-right leading-tight shrink-0">
                            {product.pum}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// EmptyState
// ---------------------------------------------------------------------------

function EmptyState({ query }) {
    return (
        <div className="flex flex-col items-center gap-4 py-20 text-center px-6">
            <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--gradient-hero-soft)' }}
            >
                <span
                    className="material-symbols-outlined text-[32px] text-[var(--color-primary)]"
                    style={{ fontVariationSettings: "'FILL' 0" }}
                >
                    search_off
                </span>
            </div>
            <div>
                <p className="text-base font-semibold text-[var(--color-text-primary)]">
                    No se encontraron productos
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    {query
                        ? `No hay resultados para "${query}". Prueba con otro término.`
                        : 'Escribe un producto en el buscador para empezar.'}
                </p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Comparar() {
    const [searchParams, setSearchParams] = useSearchParams();

    // Search state
    const [inputValue, setInputValue] = useState(searchParams.get('q') ?? '');
    const [activeQuery, setActiveQuery] = useState(searchParams.get('q') ?? '');
    const debounceRef = useRef(null);

    // Filter state
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedSupermarket, setSelectedSupermarket] = useState('');
    const [offersOnly, setOffersOnly] = useState(false);

    // Data state
    const [products, setProducts] = useState([]);
    const [total, setTotal] = useState(0);
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);

    // ---------------------------------------------------------------------------
    // Load categories once on mount
    // ---------------------------------------------------------------------------

    useEffect(() => {
        api.getProductCategories()
            .then(data => {
                if (Array.isArray(data?.categories)) {
                    setCategories(data.categories);
                }
            })
            .catch(() => {
                // Categories are optional — fail silently
            });
    }, []);

    // ---------------------------------------------------------------------------
    // Debounced search: update activeQuery 300 ms after the user stops typing
    // ---------------------------------------------------------------------------

    const handleInputChange = useCallback((value) => {
        setInputValue(value);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setActiveQuery(value.trim());
        }, 300);
    }, []);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    // ---------------------------------------------------------------------------
    // Sync activeQuery → URL param
    // ---------------------------------------------------------------------------

    useEffect(() => {
        const current = searchParams.get('q') ?? '';
        if (activeQuery !== current) {
            const next = new URLSearchParams(searchParams);
            if (activeQuery) {
                next.set('q', activeQuery);
            } else {
                next.delete('q');
            }
            setSearchParams(next, { replace: true });
        }
        // Reset pagination when query changes
        setOffset(0);
        setProducts([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeQuery]);

    // ---------------------------------------------------------------------------
    // Reset pagination when filters change
    // ---------------------------------------------------------------------------

    useEffect(() => {
        setOffset(0);
        setProducts([]);
    }, [selectedCategory, selectedSupermarket, offersOnly]);

    // ---------------------------------------------------------------------------
    // Fetch products
    // ---------------------------------------------------------------------------

    const fetchProducts = useCallback(async (currentOffset, append) => {
        if (append) {
            setLoadingMore(true);
        } else {
            setLoading(true);
            setError(null);
        }

        try {
            const params = {
                limit: PRODUCTS_PER_PAGE,
                offset: currentOffset,
            };
            if (activeQuery) params.q = activeQuery;
            if (selectedCategory) params.category = selectedCategory;
            if (selectedSupermarket) params.supermarket = selectedSupermarket;
            if (offersOnly) params.offers_only = true;

            const data = await api.searchProducts(params);
            const incoming = Array.isArray(data?.products) ? data.products : [];

            setTotal(data?.total ?? 0);
            setProducts(prev => append ? [...prev, ...incoming] : incoming);
        } catch (err) {
            console.error('[Comparar] fetchProducts error:', err);
            setError('No se pudieron cargar los productos. Inténtalo de nuevo.');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [activeQuery, selectedCategory, selectedSupermarket, offersOnly]);

    // Initial fetch and when filters/query change
    useEffect(() => {
        fetchProducts(0, false);
    }, [fetchProducts]);

    // ---------------------------------------------------------------------------
    // Load more
    // ---------------------------------------------------------------------------

    const handleLoadMore = useCallback(() => {
        const nextOffset = offset + PRODUCTS_PER_PAGE;
        setOffset(nextOffset);
        fetchProducts(nextOffset, true);
    }, [offset, fetchProducts]);

    const hasMore = products.length < total;

    // ---------------------------------------------------------------------------
    // Clear search
    // ---------------------------------------------------------------------------

    const handleClear = useCallback(() => {
        setInputValue('');
        setActiveQuery('');
    }, []);

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    const sectionTitle = activeQuery
        ? `Resultados para "${activeQuery}"`
        : 'Productos populares';

    return (
        <div className="min-h-screen bg-[var(--color-bg-page)] pb-28 lg:pb-12">
            {/* ------------------------------------------------------------------ */}
            {/* Header hero */}
            {/* ------------------------------------------------------------------ */}
            <div
                className="relative overflow-hidden px-5 pt-10 pb-8 lg:px-10"
                style={{ background: 'var(--gradient-hero)' }}
            >
                {/* Decorative blobs */}
                <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
                <div className="absolute -bottom-6 -left-6 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />

                <div className="relative max-w-3xl mx-auto">
                    <h1
                        className="text-2xl lg:text-3xl font-bold text-white mb-1"
                        style={{ fontFamily: 'var(--font-display)' }}
                    >
                        Comparar Precios
                    </h1>
                    <p className="text-white/75 text-sm mb-6">
                        Mercadona vs. Consum — encuentra siempre el mejor precio
                    </p>

                    {/* Search input */}
                    <div className="relative">
                        <span
                            className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-[20px] text-white/60 pointer-events-none"
                            style={{ fontVariationSettings: "'FILL' 0" }}
                        >
                            search
                        </span>
                        <input
                            type="search"
                            value={inputValue}
                            onChange={e => handleInputChange(e.target.value)}
                            placeholder="¿Qué producto buscas?"
                            className="w-full pl-11 pr-11 py-3.5 rounded-2xl bg-white/20 backdrop-blur text-white placeholder-white/50 border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/40 text-sm font-medium transition-all"
                            style={{ fontFamily: 'var(--font-body)' }}
                            autoComplete="off"
                            enterKeyHint="search"
                        />
                        {inputValue && (
                            <button
                                onClick={handleClear}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                                aria-label="Borrar búsqueda"
                            >
                                <span className="material-symbols-outlined text-[14px] text-white">close</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* Filters row */}
            {/* ------------------------------------------------------------------ */}
            <div className="px-5 lg:px-10 py-4 flex flex-col sm:flex-row gap-3 max-w-5xl mx-auto">
                {/* Category dropdown */}
                <div className="relative flex-1 min-w-0">
                    <span
                        className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[16px] text-[var(--color-text-muted)] pointer-events-none"
                        style={{ fontVariationSettings: "'FILL' 0" }}
                    >
                        category
                    </span>
                    <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 appearance-none cursor-pointer"
                        style={{ fontFamily: 'var(--font-body)' }}
                    >
                        <option value="">Todas las categorías</option>
                        {categories.map(cat => (
                            <option key={cat.name} value={cat.name}>
                                {cat.name} ({cat.count})
                            </option>
                        ))}
                    </select>
                </div>

                {/* Supermarket pills */}
                <div className="flex items-center gap-2 shrink-0">
                    {['', 'MERCADONA', 'CONSUM'].map(code => {
                        const meta = code ? SUPERMARKET_META[code] : null;
                        const isActive = selectedSupermarket === code;
                        const label = code === '' ? 'Todos' : (meta?.label ?? code);
                        return (
                            <button
                                key={code}
                                onClick={() => setSelectedSupermarket(code)}
                                className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 ${
                                    isActive
                                        ? 'text-white border-transparent shadow-sm'
                                        : 'bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/40 hover:text-[var(--color-text-primary)]'
                                }`}
                                style={
                                    isActive
                                        ? { backgroundColor: meta?.color ?? 'var(--color-primary)' }
                                        : {}
                                }
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>

                {/* Offers-only toggle */}
                <button
                    onClick={() => setOffersOnly(v => !v)}
                    className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all duration-150 shrink-0 ${
                        offersOnly
                            ? 'bg-red-500 text-white border-transparent shadow-sm'
                            : 'bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-red-400/40 hover:text-[var(--color-text-primary)]'
                    }`}
                >
                    <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ fontVariationSettings: offersOnly ? "'FILL' 1" : "'FILL' 0" }}
                    >
                        local_offer
                    </span>
                    Solo ofertas
                </button>
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* Results area */}
            {/* ------------------------------------------------------------------ */}
            <div className="px-5 lg:px-10 max-w-5xl mx-auto">

                {/* Section header */}
                {!loading && (
                    <div className="flex items-center justify-between mb-4">
                        <h2
                            className="text-base font-semibold text-[var(--color-text-primary)]"
                            style={{ fontFamily: 'var(--font-display)' }}
                        >
                            {sectionTitle}
                        </h2>
                        {total > 0 && (
                            <span className="text-xs text-[var(--color-text-muted)]">
                                {products.length} de {total}
                            </span>
                        )}
                    </div>
                )}

                {/* Error state */}
                {error && !loading && (
                    <div className="glass-panel rounded-2xl p-5 flex items-center gap-3 mb-6 border border-red-200/30">
                        <span className="material-symbols-outlined text-red-500 text-[20px]">error</span>
                        <p className="text-sm text-[var(--color-text-secondary)]">{error}</p>
                        <button
                            onClick={() => fetchProducts(0, false)}
                            className="ml-auto text-xs font-semibold text-[var(--color-primary)] hover:underline"
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                {/* Loading skeleton (initial) */}
                {loading && <GridSkeleton count={12} />}

                {/* Product grid */}
                {!loading && products.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
                        {products.map(product => (
                            <ProductCard key={`${product.supermarket}-${product.id}`} product={product} />
                        ))}
                    </div>
                )}

                {/* Empty state */}
                {!loading && !error && products.length === 0 && (
                    <EmptyState query={activeQuery} />
                )}

                {/* Load more */}
                {!loading && hasMore && (
                    <div className="flex justify-center mt-8">
                        <button
                            onClick={handleLoadMore}
                            disabled={loadingMore}
                            className="flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm text-white shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
                            style={{ background: 'var(--gradient-hero)', fontFamily: 'var(--font-body)' }}
                        >
                            {loadingMore ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Cargando...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[18px]">expand_more</span>
                                    Cargar más
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Loading more skeletons appended below grid */}
                {loadingMore && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <ProductCardSkeleton key={`more-${i}`} />
                        ))}
                    </div>
                )}
            </div>

        </div>
    );
}
