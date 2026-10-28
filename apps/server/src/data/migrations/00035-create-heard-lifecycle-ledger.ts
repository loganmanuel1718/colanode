import { Migration } from 'kysely';

export const createHeardLifecycleLedger: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('heard_member_event_state')
      .addColumn('heard_user_id', 'uuid', (col) => col.notNull().primaryKey())
      .addColumn('heard_organization_id', 'uuid', (col) => col.notNull())
      .addColumn('last_version', 'bigint', (col) => col.notNull())
      .addColumn('last_event_id', 'uuid', (col) => col.notNull())
      .addColumn('last_action', 'varchar(20)', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull())
      .execute();

    await db.schema
      .createTable('heard_member_event_receipts')
      .addColumn('event_id', 'uuid', (col) => col.notNull().primaryKey())
      .addColumn('heard_user_id', 'uuid', (col) => col.notNull())
      .addColumn('heard_organization_id', 'uuid', (col) => col.notNull())
      .addColumn('member_version', 'bigint', (col) => col.notNull())
      .addColumn('action', 'varchar(20)', (col) => col.notNull())
      .addColumn('occurred_at', 'varchar(40)', (col) => col.notNull())
      .addColumn('outcome', 'varchar(20)', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .execute();
    await db.schema
      .createIndex('heard_member_event_user_version_unique')
      .on('heard_member_event_receipts')
      .columns(['heard_user_id', 'member_version'])
      .unique()
      .execute();
  },
  down: async (db) => {
    await db.schema
      .dropIndex('heard_member_event_user_version_unique')
      .execute();
    await db.schema.dropTable('heard_member_event_receipts').execute();
    await db.schema.dropTable('heard_member_event_state').execute();
  },
};
