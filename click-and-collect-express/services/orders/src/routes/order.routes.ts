// =====================================================================
//  Routes HTTP du order-service
//  Montées à la racine du service : le préfixe /api/v1/orders est
//  ajouté par le gateway (proxy avec réécriture de chemin).
// =====================================================================
import { Router } from 'express';
import { orderController } from '../controllers/order.controller.js';

export const orderRoutes = Router();

orderRoutes.post('/orders', orderController.create);                    // création (client)
orderRoutes.get('/orders', orderController.list);                       // liste (cuisine / suivi)
orderRoutes.get('/orders/:id', orderController.getById);                // détail / suivi client
orderRoutes.patch('/orders/:id/status', orderController.updateStatus);  // cuisine : PAID → PREPARING → READY
