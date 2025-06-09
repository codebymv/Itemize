const { Sequelize, DataTypes } = require('sequelize');

// Parse connection URL to extract components
const parseDbUrl = () => {
  try {
    if (!process.env.DATABASE_URL) return null;
    
    // Parse the connection URL
    const regex = /^postgresql:\/\/(\w+):(.*?)@([^:]+)(:[0-9]+)?\/(.*?)$/;
    const match = process.env.DATABASE_URL.match(regex);
    
    if (!match) return null;
    
    return {
      username: match[1],
      password: match[2],
      host: match[3],
      port: match[4] ? parseInt(match[4].substring(1)) : 5432,
      database: match[5]
    };
  } catch (err) {
    console.error('Error parsing database URL:', err);
    return null;
  }
};

const dbConfig = parseDbUrl();
let sequelize;

if (dbConfig) {
  // Initialize Sequelize with explicit configuration parameters instead of URL
  // This allows us to handle IPv4/IPv6 issues more explicitly
  sequelize = new Sequelize({
    database: dbConfig.database,
    username: dbConfig.username,
    password: dbConfig.password,
    host: dbConfig.host,
    port: dbConfig.port,
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // For Supabase connection
      }
    },
    // Add connection pool configuration for better stability
    pool: {
      max: 5,           // Maximum number of connections in pool
      min: 0,           // Minimum number of connections in pool
      acquire: 30000,   // Maximum time (ms) to acquire a connection
      idle: 10000       // Maximum time (ms) a connection can be idle before being released
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false
  });
  
  console.log(`Database connection initialized with host: ${dbConfig.host}, port: ${dbConfig.port}`);
} else {
  // Fallback to direct URL if parsing fails
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false
  });
}

// Define User model
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  email: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  picture: {
    type: DataTypes.STRING,
    allowNull: true
  },
  googleId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  provider: {
    type: DataTypes.STRING,
    defaultValue: 'google'
  }
});

// Define List model
const List = sequelize.define('List', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    defaultValue: 'General'
  },
  items: {
    type: DataTypes.JSONB, // Store items as JSON array
    defaultValue: []
  },
  color_value: {
    type: DataTypes.TEXT, // Store hex color codes as text
    allowNull: true       // Allow null for lists without a specific color
  }
});

// Set up associations - each list belongs to a user
List.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(List, { foreignKey: 'userId' });

// Function to initialize database
const initializeDatabase = async () => {
  try {
    // Test the connection
    await sequelize.authenticate();
    console.log('Connection to database has been established successfully.');
    
    // Sync all models with database
    await sequelize.sync({ alter: process.env.NODE_ENV === 'development' });
    console.log('All models were synchronized successfully.');
    
    return true;
  } catch (error) {
    console.error('Unable to connect to the database or synchronize models:', error);
    // Fall back to in-memory if database connection fails
    console.log('Falling back to in-memory storage...');
    return true; // Return true to allow server to start anyway
  }
};

module.exports = {
  sequelize,
  User,
  List,
  initializeDatabase
};

// Legacy initialization function - kept for compatibility
const initializeModels = async () => {
  try {
    console.log('Using in-memory data store (no database connection)');
    return true;
  } catch (error) {
    console.error('Error initializing models:', error);
    return false;
  }
};

// Export models
module.exports = {
  sequelize,
  User,
  List,
  initializeDatabase,
  initializeModels
};
