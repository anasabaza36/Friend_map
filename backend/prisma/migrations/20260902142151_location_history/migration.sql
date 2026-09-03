-- CreateTable
CREATE TABLE "location_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "location_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "location_history_user_id_timestamp_idx" ON "location_history"("user_id", "timestamp");

-- CreateIndex
CREATE INDEX "location_history_created_at_idx" ON "location_history"("created_at");

-- AddForeignKey
ALTER TABLE "location_history" ADD CONSTRAINT "location_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
