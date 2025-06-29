# Getting Started with Itemize.cloud (GitHub)

Welcome to the Itemize.cloud project! This guide will help you get the development environment up and running on your local machine.

## Table of Contents

- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Running the Application](#running-the-application)
  - [Backend](#backend)
  - [Frontend](#frontend)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

Before you begin, ensure you have the following installed:

*   **Node.js**: Version 18 or higher. You can download it from [nodejs.org](https://nodejs.org/).
*   **npm**: Comes with Node.js. Used for package management.
*   **PostgreSQL**: A PostgreSQL database server. You can download it from [postgresql.org](https://www.postgresql.org/download/).
*   **Git**: For cloning the repository.

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/itemize.cloud.git # Replace with actual repo URL
    cd itemize.cloud/Prototype1
    ```

2.  **Set up Backend:**

    Navigate to the `backend` directory and install dependencies:

    ```bash
    cd backend
    npm install
    ```

    Create a `.env` file in the `backend` directory based on `.env.example` and fill in your database connection string and JWT secret:

    ```env
    # .env in backend/
    FRONTEND_URL=http://localhost:5173
    DATABASE_URL=postgresql://user:password@host:port/database_name
    JWT_SECRET=your_super_secret_jwt_key
    GEMINI_API_KEY=your_google_gemini_api_key
    ```

    Initialize the database schema. You might need to manually run the SQL scripts or use a migration tool if available:

    ```bash
    # Example: Connect to your PostgreSQL database and run schema.sql and categories_migration.sql
    # psql -U user -d database_name -f schema.sql
    # psql -U user -d database_name -f categories_migration.sql
    ```

3.  **Set up Frontend:**

    Navigate to the `frontend` directory and install dependencies:

    ```bash
    cd ../frontend
    npm install
    ```

    Create a `.env` file in the `frontend` directory based on `.env.example`:

    ```env
    # .env in frontend/
    VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
    VITE_API_URL=http://localhost:3001/api # Ensure this matches your backend port
    ```

## Running the Application

### Backend

From the `backend` directory, start the server:

```bash
cd backend
npm run dev # For development with nodemon
# or
npm start # For production-like run
```

The backend server will typically run on `http://localhost:3001`.

### Frontend

From the `frontend` directory, start the development server:

```bash
cd frontend
npm run dev
```

The frontend application will typically be accessible at `http://localhost:5173`.

## Project Structure

```
itemize.cloud/
├── backend/             # Node.js/Express API
│   ├── src/             # Backend source code
│   ├── .env.example     # Environment variables example
│   ├── package.json     # Backend dependencies and scripts
│   └── schema.sql       # Database schema
├── frontend/            # React/Vite application
│   ├── src/             # Frontend source code
│   ├── .env.example     # Environment variables example
│   ├── package.json     # Frontend dependencies and scripts
│   └── vite.config.ts   # Vite configuration
└── !docs/               # Project documentation
    ├── API/
    ├── Config/
    ├── Data/
    ├── Dependencies/
    ├── Deploy/
    ├── Implementations/
    ├── Security/
    └── Sitemap/
```

## Contributing

We welcome contributions to Itemize.cloud! If you'd like to contribute, please follow these steps:

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/YourFeature`).
3.  Make your changes.
4.  Commit your changes (`git commit -m 'Add some feature'`).
5.  Push to the branch (`git push origin feature/YourFeature`).
6.  Open a Pull Request.

Please ensure your code adheres to the project's coding standards and includes appropriate tests.

## License

This project is licensed under the MIT License - see the `LICENSE` file for details. (Note: A `LICENSE` file is not included in the provided context, but typically would be in a GitHub project.)
