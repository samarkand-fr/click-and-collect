// =====================================================================
//  Seed du catalogue — 6 produits café / restauration
//  Idempotent : existence testée par le nom unique → ré-exécutable sans
//  doublon. Le stock n'est JAMAIS écrasé sur un produit existant (état
//  runtime géré par reserve / release / back-office).
//  Exécution : `npm run db:seed` ou au boot du service (SEED_ON_BOOT).
// =====================================================================
import { Prisma, PrismaClient } from '../src/generated/prisma/index.js';

// URL d'illustration indicatives — à remplacer par vos visuels réels.
export const SEED_PRODUCTS: Prisma.ProductUncheckedCreateInput[] = [
  {
    name: 'Espresso Arabica',
    description: 'Shot intense 100% arabica, notes de cacao, origine Éthiopie.',
    price: 250, // 2,50 €
    category: 'coffee',
    stock: 60,
    imageUrl: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Cappuccino',
    description: 'Double espresso, lait vapeur et mousse onctueuse saupoudrée de cacao.',
    price: 380, // 3,80 €
    category: 'coffee',
    stock: 45,
    imageUrl: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Latte Vanille',
    description: 'Latte crémeux au sirop de vanille de Madagascar, art latte inclus.',
    price: 450, // 4,50 €
    category: 'coffee',
    stock: 40,
    imageUrl: 'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Croque Monsieur',
    description: 'Pain de mie doré au beurre, jambon blanc, emmental fondu, béchamel maison.',
    price: 690, // 6,90 €
    category: 'food',
    stock: 20,
    imageUrl: 'https://images.unsplash.com/photo-1484723091739-30a097e8f929?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Bagel Saumon Fumé',
    description: "Bagel toasté, saumon fumé, cream cheese à l'aneth, roquette et citron.",
    price: 890, // 8,90 €
    category: 'food',
    stock: 15,
    imageUrl: 'https://images.unsplash.com/photo-1553909489-cd47e0907980?auto=format&fit=crop&w=800&q=80',
  },
  {
    name: 'Brownie Noisette',
    description: 'Brownie moelleux chocolat noir 70% et noisettes torréfiées.',
    price: 420, // 4,20 €
    category: 'dessert',
    stock: 25,
    imageUrl: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=800&q=80',
  },
];

export async function seedProducts(
  client: PrismaClient,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const product of SEED_PRODUCTS) {
    const existing = await client.product.findUnique({ where: { name: product.name } });

    if (existing) {
      // Mise à jour du contenu éditorial uniquement — jamais du stock.
      await client.product.update({
        where: { name: product.name },
        data: {
          description: product.description,
          price: product.price,
          category: product.category,
          imageUrl: product.imageUrl,
        },
      });
      updated += 1;
    } else {
      await client.product.create({
        data: { ...product, isAvailable: true },
      });
      created += 1;
    }
  }

  return { created, updated };
}

// ── Exécution directe : `npm run db:seed` ou `npx prisma db seed` ────────────
if (require.main === module) {
  const prisma = new PrismaClient();
  seedProducts(prisma)
    .then(async (result) => {
      process.stdout.write(
        `Seed terminé : ${result.created} créé(s), ${result.updated} mis à jour\n`,
      );
      await prisma.$disconnect();
    })
    .catch(async (err) => {
      process.stderr.write(`Seed en échec : ${String(err)}\n`);
      await prisma.$disconnect();
      process.exit(1);
    });
}
