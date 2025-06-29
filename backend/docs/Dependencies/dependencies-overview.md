# Dependencies Overview

## Dependency Management Strategy

Itemize.cloud follows a standard dependency management approach, ensuring stability and maintainability.

## Frontend Dependencies

### Core Framework Dependencies

#### React Ecosystem
```json
{
  "react": "^18.3.1",
  "react-dom": "^18.3.1"
}
```
- **Purpose**: Core UI framework

#### Build Tools
```json
{
  "vite": "^5.4.1",
  "@vitejs/plugin-react-swc": "^3.5.0"
}
```
- **Purpose**: Modern build tooling for fast development and optimized builds

### UI Framework & Styling

#### Tailwind CSS & Components
```json
{
  "class-variance-authority": "^0.7.1",
  "clsx": "^2.1.1",
  "tailwind-merge": "^2.5.2",
  "tailwindcss-animate": "^1.0.7"
}
```
- **Purpose**: Utility-first CSS framework and component styling

#### Radix UI (Shadcn/ui)
```json
{
  "@radix-ui/react-accordion": "^1.2.0",
  "@radix-ui/react-alert-dialog": "^1.1.1",
  "@radix-ui/react-aspect-ratio": "^1.1.0",
  "@radix-ui/react-avatar": "^1.1.0",
  "@radix-ui/react-checkbox": "^1.1.1",
  "@radix-ui/react-collapsible": "^1.1.0",
  "@radix-ui/react-context-menu": "^2.2.1",
  "@radix-ui/react-dialog": "^1.1.2",
  "@radix-ui/react-dropdown-menu": "^2.1.1",
  "@radix-ui/react-hover-card": "^1.1.1",
  "@radix-ui/react-label": "^2.1.0",
  "@radix-ui/react-menubar": "^1.1.1",
  "@radix-ui/react-navigation-menu": "^1.2.0",
  "@radix-ui/react-popover": "^1.1.1",
  "@radix-ui/react-progress": "^1.1.0",
  "@radix-ui/react-radio-group": "^1.2.0",
  "@radix-ui/react-scroll-area": "^1.1.0",
  "@radix-ui/react-select": "^2.1.1",
  "@radix-ui/react-separator": "^1.1.0",
  "@radix-ui/react-slider": "^1.2.0",
  "@radix-ui/react-slot": "^1.1.0",
  "@radix-ui/react-switch": "^1.1.0",
  "@radix-ui/react-tabs": "^1.1.0",
  "@radix-ui/react-toast": "^1.2.1",
  "@radix-ui/react-toggle": "^1.1.0",
  "@radix-ui/react-toggle-group": "^1.1.0",
  "@radix-ui/react-tooltip": "^1.1.4"
}
```
- **Purpose**: Accessible, unstyled UI primitives

### Data Management & State

#### State Management
```json
{
  "@tanstack/react-query": "^5.56.2"
}
```
- **Purpose**: Server state caching

### Development Dependencies

#### Linting & Formatting
```json
{
  "eslint": "^9.9.0",
  "@eslint/js": "^9.9.0",
  "typescript-eslint": "^8.0.1",
  "globals": "^15.9.0"
}
```
- **Purpose**: Code quality and consistent formatting

## Backend Dependencies

### Core Server Dependencies

#### Express.js Ecosystem
```json
{
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "helmet": "^7.1.0",
  "morgan": "^1.10.0"
}
```
- **Purpose**: Web server framework with security and CORS handling

#### Database
```json
{
  "pg": "^8.16.0",
  "pg-hstore": "^2.3.4",
  "sequelize": "^6.37.7"
}
```
- **Purpose**: PostgreSQL client and ORM

### Authentication & Security

#### Security Middleware
```json
{
  "jsonwebtoken": "^9.0.2"
}
```
- **Purpose**: JWT authentication

#### Environment & Configuration
```json
{
  "dotenv": "^16.5.0"
}
```
- **Purpose**: Environment variable management

### AI Integration
```json
{
  "@google/generative-ai": "^0.24.1"
}
```
- **Purpose**: Google Generative AI integration

### Development Dependencies

#### Development Tools
```json
{
  "nodemon": "^3.0.1"
}
```
- **Purpose**: Automatically restart the server during development
