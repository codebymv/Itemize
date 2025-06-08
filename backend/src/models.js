// In-memory storage for users and lists until database is set up
const usersStore = new Map();
const listsStore = new Map();
let userIdCounter = 1;
let listIdCounter = 1;

/**
 * Simple in-memory User model to use until database is set up
 */
class User {
  static async findOne({ where }) {
    const { email, googleId } = where || {};
    
    if (email) {
      return [...usersStore.values()].find(user => user.email === email);
    }
    
    if (googleId) {
      return [...usersStore.values()].find(user => user.googleId === googleId);
    }
    
    return null;
  }
  
  static async create(userData) {
    const id = userIdCounter++;
    const timestamp = new Date();
    
    const user = {
      id,
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      googleId: userData.googleId,
      provider: userData.provider || 'google',
      createdAt: timestamp,
      updatedAt: timestamp,
      save: async function() {
        usersStore.set(this.id, this);
        return this;
      }
    };
    
    usersStore.set(id, user);
    return user;
  }
}

/**
 * Simple in-memory List model to use until database is set up
 */
class List {
  static async findAll(options = {}) {
    const { where } = options;
    let lists = [...listsStore.values()];
    
    if (where && where.userId) {
      lists = lists.filter(list => list.userId === where.userId);
    }
    
    return lists;
  }
  
  static async findByPk(id) {
    return listsStore.get(id) || null;
  }
  
  static async create(listData) {
    const id = listIdCounter++;
    const timestamp = new Date();
    
    const list = {
      id,
      title: listData.title,
      category: listData.category || 'General',
      items: listData.items || [],
      userId: listData.userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      save: async function() {
        listsStore.set(this.id, this);
        return this;
      },
      destroy: async function() {
        return listsStore.delete(this.id);
      }
    };
    
    listsStore.set(id, list);
    return list;
  }
}

// Mock initialization - no actual database needed yet
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
  User,
  List,
  initializeModels
};
