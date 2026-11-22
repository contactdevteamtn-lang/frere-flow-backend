// Modèle « Product » — collection MongoDB ff_products
// Produit (légume, fruit…) avec son prix de vente et son seuil d'alerte de stock.
//
// Types : 'string' | 'number' | 'boolean' | 'array' | 'object' ; '?' = facultatif ; [ ... ] = valeurs permises.
// Les règles de saisie (formats, longueurs, exemples) sont dans domain.mjs (validation.ts du site).
import { ID } from './types.js';

export const Product = {
  name: 'Product',
  collection: 'products',
  permission: 'produits', // droit requis pour créer / modifier / supprimer
  schema: { id: ID, reference: 'string', name: 'string', 'nameAlt?': 'string', category: 'string', unit: 'string', salePrice: 'number', alertThreshold: 'number', active: 'boolean' },
};

export default Product;
