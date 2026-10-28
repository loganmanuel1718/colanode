import { Migration } from 'kysely';

export const createHeardMappings: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('heard_workspace_mappings')
      .addColumn('heard_organization_id', 'uuid', (col) =>
        col.notNull().primaryKey()
      )
      .addColumn('workspace_id', 'varchar(30)', (col) =>
        col.notNull().unique().references('workspaces.id').onDelete('restrict')
      )
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .execute();

    await db.schema
      .createTable('heard_member_mappings')
      .addColumn('heard_user_id', 'uuid', (col) => col.notNull().primaryKey())
      .addColumn('heard_organization_id', 'uuid', (col) =>
        col
          .notNull()
          .references('heard_workspace_mappings.heard_organization_id')
          .onDelete('restrict')
      )
      .addColumn('account_id', 'varchar(30)', (col) =>
        col.notNull().unique().references('accounts.id').onDelete('restrict')
      )
      .addColumn('user_id', 'varchar(30)', (col) =>
        col.notNull().unique().references('users.id').onDelete('restrict')
      )
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('revoked_at', 'timestamptz')
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('heard_member_mappings').execute();
    await db.schema.dropTable('heard_workspace_mappings').execute();
  },
};
