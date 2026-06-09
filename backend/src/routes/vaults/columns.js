const vaultColumnNames = [
    'id',
    'user_id',
    'title',
    'category',
    'color_value',
    'position_x',
    'position_y',
    'width',
    'height',
    'z_index',
    'is_locked',
    'encryption_salt',
    'master_password_hash',
    'created_at',
    'updated_at',
    'share_token',
    'is_public',
    'shared_at'
];

const vaultItemColumnNames = [
    'id',
    'vault_id',
    'item_type',
    'label',
    'encrypted_value',
    'iv',
    'order_index',
    'created_at',
    'updated_at'
];

const qualify = (columns, alias) => columns.map(column => alias ? `${alias}.${column}` : column).join(', ');

const vaultColumns = (alias) => qualify(vaultColumnNames, alias);
const vaultItemColumns = (alias) => qualify(vaultItemColumnNames, alias);

module.exports = {
    vaultColumns,
    vaultItemColumns,
    vaultColumnNames,
    vaultItemColumnNames
};
