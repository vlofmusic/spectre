import { sqliteTable, text, integer, primaryKey, index, uniqueIndex, check } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
export const inventory=sqliteTable('inventory',{size:text('size').primaryKey(),quantity:integer('quantity').notNull()},t=>[check('stock_nonnegative',sql`${t.quantity} >= 0`)]);
// The marker survives an empty stock table; setup must never become a restock action.
export const inventoryInitializations=sqliteTable('inventory_initializations',{
 id:text('id').primaryKey(),requestKey:text('request_key').notNull(),initializedAt:integer('initialized_at').notNull()
});
export const holds=sqliteTable('holds',{tokenHash:text('token_hash').primaryKey(),expiresAt:integer('expires_at').notNull()},t=>[index('holds_expiry').on(t.expiresAt)]);
export const heldItems=sqliteTable('held_items',{tokenHash:text('token_hash').notNull().references(()=>holds.tokenHash,{onDelete:'cascade'}),size:text('size').notNull().references(()=>inventory.size),quantity:integer('quantity').notNull()},t=>[primaryKey({columns:[t.tokenHash,t.size]}),index('held_size').on(t.size),check('held_positive',sql`${t.quantity} > 0`)]);
// Requests survive reservation expiry. They are not payments or completed sales.
export const orders=sqliteTable('orders',{
 reference:text('reference').primaryKey(),tokenHash:text('token_hash').notNull(),requestKey:text('request_key').notNull(),
 createdAt:integer('created_at').notNull(),holdExpiresAt:integer('hold_expires_at').notNull(),
 name:text('name').notNull(),contactMethod:text('contact_method').notNull(),contact:text('contact').notNull(),
 drawstrings:integer('drawstrings').notNull(),notes:text('notes').notNull(),items:text('items').notNull(),
 unitPrice:integer('unit_price').notNull(),currency:text('currency').notNull(),
 notificationStatus:text('notification_status').notNull().default('pending'),messageId:integer('message_id')
},t=>[uniqueIndex('order_attempt').on(t.tokenHash,t.requestKey),index('orders_created').on(t.createdAt)]);
