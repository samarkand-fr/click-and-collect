// =====================================================================
//  Contrôleurs HTTP — couche fine :
//  validation d'entrée (zod) → délégation au service → réponse HTTP.
//  Toute exception est convertie par le middleware d'erreurs global
//  (Express 5 transmet les rejets async automatiquement).
// =====================================================================
import type { Request, Response } from 'express';
import { productService } from '../services/product.service.js';
import { BadRequestError } from '../lib/errors.js';
import {
  createProductSchema,
  itemListSchema,
  listProductsQuerySchema,
} from '../types/product.types.js';

export const productController = {
  /** GET /products?category=&search=&includeUnavailable= */
  async list(req: Request, res: Response): Promise<void> {
    const query = listProductsQuerySchema.parse(req.query);
    const { items, total } = await productService.listProducts(query);
    res.json({ data: items, total });
  },

  /** GET /products/:id */
  async getById(req: Request, res: Response): Promise<void> {
    const id = req.params.id;
    if (typeof id !== 'string') {
      throw new BadRequestError('Identifiant de produit invalide');
    }
    const product = await productService.getProduct(id);
    res.json({ data: product });
  },

  /** POST /products — création d'un produit (back-office). */
  async create(req: Request, res: Response): Promise<void> {
    const dto = createProductSchema.parse(req.body);
    const product = await productService.createProduct(dto);
    res.status(201).json({ data: product });
  },

  /** POST /products/reserve — décrément atomique du stock. */
  async reserve(req: Request, res: Response): Promise<void> {
    const { items } = itemListSchema.parse(req.body);
    const result = await productService.reserveStock(items);
    res.json({ data: result });
  },

  /** POST /products/release — ré-incrément du stock (compensation). */
  async release(req: Request, res: Response): Promise<void> {
    const { items } = itemListSchema.parse(req.body);
    const result = await productService.releaseStock(items);
    res.json({ data: result });
  },
};
