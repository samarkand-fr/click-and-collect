-- Initialisation du schéma des commandes (miroir exact de schema.prisma)

CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'PREPARING', 'READY', 'CANCELLED');

CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- Tableau de bord cuisine : commandes par statut
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- Liste chronologique (suivi client, réconciliation)
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");
