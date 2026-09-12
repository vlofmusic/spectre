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
// Customer receipts are independent of the owner's notification and never change stock.
export const customerConfirmations=sqliteTable('customer_confirmations',{
 reference:text('reference').primaryKey().references(()=>orders.reference,{onDelete:'cascade'}),
 channel:text('channel').notNull(),status:text('status').notNull(),createdAt:integer('created_at').notNull(),
 linkTokenHash:text('link_token_hash'),linkExpiresAt:integer('link_expires_at'),
 telegramChatId:text('telegram_chat_id'),claimedAt:integer('claimed_at'),
 attemptedAt:integer('attempted_at'),providerId:text('provider_id')
},t=>[uniqueIndex('customer_link_token').on(t.linkTokenHash)]);
export const customerConfirmationAttempts=sqliteTable('customer_confirmation_attempts',{
 reference:text('reference').primaryKey().references(()=>orders.reference,{onDelete:'cascade'}),
 holdKey:text('hold_key').notNull(),recipientHash:text('recipient_hash').notNull(),
 ipHash:text('ip_hash'),createdAt:integer('created_at').notNull()
},t=>[index('customer_attempt_hold').on(t.holdKey),index('customer_attempt_recipient').on(t.recipientHash,t.createdAt),
 index('customer_attempt_ip').on(t.ipHash,t.createdAt),index('customer_attempt_created').on(t.createdAt)]);
export const telegramReceiptUpdates=sqliteTable('telegram_receipt_updates',{
 updateId:integer('update_id').primaryKey(),createdAt:integer('created_at').notNull()
},t=>[index('telegram_receipt_updates_created').on(t.createdAt)]);
