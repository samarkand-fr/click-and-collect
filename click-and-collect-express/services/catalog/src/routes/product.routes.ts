// =====================================================================
//  Routes HTTP du catalog-service
//  Montées à la racine du service : le préfixe /api/v1/catalog est
//  ajouté par le gateway (proxy avec réécriture de chemin).
// =====================================================================
import { Router } from 'express';
import { productController } from '../controllers/product.controller.js';

export const productRoutes = Router();

productRoutes.get('/products', productController.list);              // liste (disponibles par défaut)
productRoutes.get('/products/:id', productController.getById);       // détail
productRoutes.post('/products', productController.create);           // création (back-office)
productRoutes.post('/products/reserve', productController.reserve);  // décrément atomique (orders-service)
productRoutes.post('/products/release', productController.release);  // ré-incrément (compensation)
