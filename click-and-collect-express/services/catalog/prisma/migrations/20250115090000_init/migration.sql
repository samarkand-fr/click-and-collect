-- Initialisation du schéma du catalogue (miroir exact de schema.prisma)

CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- Nom de produit unique (base de l'idempotence du seed)
CREATE UNIQUE INDEX "products_name_key" ON "products"("name");

-- Filtre par catégorie (GET /products?category=coffee)
CREATE INDEX "products_category_idx" ON "products"("category");
