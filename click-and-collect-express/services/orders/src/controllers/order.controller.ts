// =====================================================================
//  Contrôleurs HTTP — couche fine :
//  validation d'entrée (zod) → délégation au service → réponse HTTP.
// =====================================================================
import type { Request, Response } from 'express';
import type { Order } from '../generated/prisma/index.js';
import { orderService } from '../services/order.service.js';
import { BadRequestError } from '../lib/errors.js';
import {
  createOrderSchema,
  kitchenStatusSchema,
  listOrdersQuerySchema,
  parseOrderItems,
} from '../types/order.types.js';

/** Sérialisation stable de la commande pour la réponse HTTP. */
function toOrderView(order: Order) {
  return {
    id: order.id,
    customerName: order.customerName,
    items: parseOrderItems(order.items),
    totalAmount: order.totalAmount,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

export const orderController = {
  /** POST /orders — création : reserve → PENDING → order.created. */
  async create(req: Request, res: Response): Promise<void> {
    const dto = createOrderSchema.parse(req.body);
    const order = await orderService.createOrder(dto);
    res.status(201).json({ data: toOrderView(order) });
  },

  /** GET /orders?status=PAID — tableau de bord cuisine / suivi. */
  async list(req: Request, res: Response): Promise<void> {
    const query = listOrdersQuerySchema.parse(req.query);
    const orders = await orderService.listOrders(query.status);
    res.json({ data: orders.map(toOrderView), total: orders.length });
  },

  /** GET /orders/:id — détail / suivi client. */
  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id;
    if (typeof id !== 'string') {
      throw new BadRequestError('Identifiant de commande invalide');
    }
    const order = await orderService.getOrder(id);
    res.json({ data: toOrderView(order) });
  },

  /** PATCH /orders/:id/status — cuisine : PAID → PREPARING → READY. */
  async updateStatus(req: Request, res: Response): Promise<void> {
    const id = req.params.id;
    if (typeof id !== 'string') {
      throw new BadRequestError('Identifiant de commande invalide');
    }
    const { status } = kitchenStatusSchema.parse(req.body);
    const order = await orderService.kitchenTransition(id, status);
    res.json({ data: toOrderView(order) });
  },
};
