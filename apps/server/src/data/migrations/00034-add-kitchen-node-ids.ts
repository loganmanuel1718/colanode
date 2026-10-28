import { Migration } from 'kysely';

export const addKitchenNodeIds: Migration = {
  up: async (db) => {
    await db.schema
      .alterTable('heard_workspace_mappings')
      .addColumn('kitchen_space_id', 'varchar(30)')
      .addColumn('kitchen_channel_id', 'varchar(30)')
      .execute();
    await db.schema
      .createIndex('heard_kitchen_space_id_unique')
      .on('heard_workspace_mappings')
      .column('kitchen_space_id')
      .unique()
      .execute();
    await db.schema
      .createIndex('heard_kitchen_channel_id_unique')
      .on('heard_workspace_mappings')
      .column('kitchen_channel_id')
      .unique()
      .execute();
  },
  down: async (db) => {
    await db.schema.dropIndex('heard_kitchen_channel_id_unique').execute();
    await db.schema.dropIndex('heard_kitchen_space_id_unique').execute();
    await db.schema
      .alterTable('heard_workspace_mappings')
      .dropColumn('kitchen_channel_id')
      .dropColumn('kitchen_space_id')
      .execute();
  },
};
