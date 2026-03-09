# API de Consum (tienda.consum.es) — Documentación

## Fecha de investigación: 2026-03-06

## Base URL
```
https://tienda.consum.es/api/rest/V1.0
```

## Endpoint principal: Catálogo de productos
```
GET /catalog/product?limit={n}&offset={n}
```

### Parámetros
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `limit` | int | Productos por página (max 100, cap del servidor) |
| `offset` | int | Offset para paginación (0-based) |

> **Nota**: los parámetros `search` y `categoryId` NO filtran realmente — siempre devuelven el catálogo completo (9054 productos). El filtrado debe hacerse client-side.

### Respuesta
```json
{
  "totalCount": 9054,
  "totalRecipeCount": 0,
  "hasMore": true,
  "products": [...]
}
```

### Estructura de un producto
```json
{
  "id": 4667,
  "productType": 1,
  "code": "1669",
  "ean": "8423230065137",
  "type": "product",
  "productData": {
    "name": "Rabanito Bolsa",
    "brand": { "id": "EL DULZE", "name": "EL DULZE" },
    "url": "https://tienda.consum.es/es/p/rabanito-bolsa/1669",
    "imageURL": "https://cdn-consum.aktiosdigitalservices.com/tol/consum/media/product/img/300x300/1669.jpg",
    "description": "Rabanito Bolsa 250 Gr",
    "format": "",
    "novelty": false,
    "availability": "1"
  },
  "media": [
    { "url": "...1669_001.jpg", "order": 1, "type": "P" }
  ],
  "priceData": {
    "prices": [
      {
        "id": "PRICE",
        "value": { "centAmount": 1.15, "centUnitAmount": 4.6 }
      }
    ],
    "taxPercentage": 4.0,
    "unitPriceUnitType": "1 Kg",
    "minimumUnit": 1.0,
    "maximumUnit": 49.0
  },
  "categories": [
    { "id": 2214, "name": "Zanahorias y otras raíces", "type": 0 }
  ],
  "offers": [],
  "coupons": []
}
```

### Productos con oferta (precio rebajado)
Cuando un producto tiene oferta, aparece un segundo precio con `id: "OFFER_PRICE"` y un array `offers` con detalles de la promoción:
```json
{
  "priceData": {
    "prices": [
      { "id": "PRICE", "value": { "centAmount": 0.42, "centUnitAmount": 3.99 } },
      { "id": "OFFER_PRICE", "value": { "centAmount": 0.31, "centUnitAmount": 2.99 } }
    ]
  },
  "offers": [{
    "id": 11448929,
    "from": "2026-03-02T23:00:00.000Z",
    "to": "2026-03-09T22:59:00.000Z",
    "shortDescription": "Ahora más barato",
    "amount": 0.31,
    "inmediate": true
  }]
}
```

## Autenticación
**No requiere autenticación.** La API es pública y responde sin tokens ni API keys.

## Rate Limiting
- No hay headers `X-RateLimit-*` en la respuesta
- 5 requests rápidas secuenciales → todas 200 OK
- El servidor usa **Incapsula CDN** (cookies `visid_incap_*`, `incap_ses_*`)
- Recomendación: usar delay de 0.5-1s entre requests para ser respetuosos

## Paginación
- Max 100 productos por request (el servidor ignora `limit` > 100)
- Total productos: **9,054** (a fecha 2026-03-06)
- Páginas necesarias: ceil(9054/100) = **91 requests**
- `hasMore: true/false` indica si hay más páginas

## CDN de imágenes
```
https://cdn-consum.aktiosdigitalservices.com/tol/consum/media/product/img/300x300/{code}.jpg
```

## Campos clave para nuestro modelo Product
| Campo Consum | → | Campo NutriConsum |
|---|---|---|
| `productData.name` | → | `product_name` |
| `priceData.prices[0].value.centAmount` | → | `price` |
| `ean` | → | `ean` |
| `productData.imageURL` | → | `image_url` |
| `categories[0].name` | → | `category` |
| `productData.brand.name` | → | `brand` |
| `productData.description` | → | `description` |
| `code` | → | `external_id` |
| (hardcoded) | → | `supermarket = 'CONSUM'` |
| `priceData.unitPriceUnitType` | → | `unit_type` |
| `priceData.prices[0].value.centUnitAmount` | → | `unit_price` |

## Notas técnicas
- Backend: Aktios Digital Services (plataforma e-commerce)
- Frontend: Angular SPA
- Las imágenes tienen timestamps de caché (`?t=20260306...`)
- Categorías embebidas en cada producto (no hay endpoint de categorías standalone)
- 74 categorías únicas en los primeros 100 productos
