/// <reference path="../pb_data/types.d.ts" />
// Creates the `records` collection that stores every synced habit and log as one JSON row.
// Written for PocketBase 0.23+ JS migrations. Not yet run against a real server: see ../README.md "Verify".
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    const records = new Collection({
      type: 'base',
      name: 'records',
      // Every rule scopes access to the row owner. `user` cannot be reassigned on update.
      listRule: 'user = @request.auth.id',
      viewRule: 'user = @request.auth.id',
      createRule: '@request.auth.id != "" && @request.body.user = @request.auth.id',
      updateRule: 'user = @request.auth.id && @request.body.user:isset = false',
      deleteRule: 'user = @request.auth.id',
      fields: [
        // cascadeDelete: deleting the account deletes all of its records (store requirement).
        { type: 'relation', name: 'user', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
        { type: 'select', name: 'entity', required: true, maxSelect: 1, values: ['habits', 'habit_logs'] },
        { type: 'text', name: 'cid', required: true, max: 64 },
        { type: 'text', name: 'version', required: true, max: 64 },
        { type: 'json', name: 'data', required: true, maxSize: 200000 },
        { type: 'autodate', name: 'created', onCreate: true },
        { type: 'autodate', name: 'updated', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_records_owner_cid ON records (user, entity, cid)',
        'CREATE INDEX idx_records_user_updated ON records (user, updated, id)',
      ],
    });

    app.save(records);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('records'));
  },
);
