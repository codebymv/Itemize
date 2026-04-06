const REQUIRED_ENV_VARS = [
    { 
        var: 'JWT_SECRET', 
        name: 'JWT Secret',
        validate: (v) => {
            if (v.length < 32) return 'must be at least 32 characters';
            return true;
        }
    },
    { 
        var: 'DATABASE_URL', 
        name: 'Database URL',
        validate: (v) => {
            if (!v.startsWith('postgresql://') && !v.startsWith('postgres://')) {
                return 'must be a valid PostgreSQL connection string';
            }
            return true;
        }
    },
    { 
        var: 'FRONTEND_URL', 
        name: 'Frontend URL',
        validate: (v) => {
            if (!v.startsWith('http://') && !v.startsWith('https://')) {
                return 'must be a valid URL starting with http:// or https://';
            }
            return true;
        }
    },
];

const OPTIONAL_ENV_VARS = [
    { var: 'SENTRY_DSN', name: 'Sentry DSN' },
    { var: 'RESEND_API_KEY', name: 'Resend API Key' },
    { var: 'TWILIO_ACCOUNT_SID', name: 'Twilio Account SID' },
    { var: 'TWILIO_AUTH_TOKEN', name: 'Twilio Auth Token' },
    { var: 'GOOGLE_CLIENT_ID', name: 'Google Client ID' },
    { var: 'GOOGLE_CLIENT_SECRET', name: 'Google Client Secret' },
    { var: 'STRIPE_SECRET_KEY', name: 'Stripe Secret Key' },
    { var: 'STRIPE_WEBHOOK_SECRET', name: 'Stripe Webhook Secret' },
    { var: 'AWS_ACCESS_KEY_ID', name: 'AWS Access Key ID' },
    { var: 'AWS_SECRET_ACCESS_KEY', name: 'AWS Secret Access Key' },
    { var: 'AWS_REGION', name: 'AWS Region' },
];

module.exports.validateEnv = () => {
    const errors = [];
    const warnings = [];
    
    // Validate required variables
    for (const envVar of REQUIRED_ENV_VARS) {
        const value = process.env[envVar.var];
        
        if (!value) {
            errors.push(`${envVar.name} (${envVar.var}) is required`);
            continue;
        }
        
        if (envVar.validate) {
            const result = envVar.validate(value);
            if (result !== true) {
                errors.push(`${envVar.name} (${envVar.var}) ${result}`);
            }
        }
    }
    
    // Check optional variables and warn about missing ones
    for (const envVar of OPTIONAL_ENV_VARS) {
        const value = process.env[envVar.var];
        if (!value) {
            warnings.push(`${envVar.name} (${envVar.var}) is not configured - some features may be limited`);
        }
    }
    
    // Validate AWS configuration completeness
    const hasAwsKeyId = !!process.env.AWS_ACCESS_KEY_ID;
    const hasAwsSecret = !!process.env.AWS_SECRET_ACCESS_KEY;
    const hasAwsRegion = !!process.env.AWS_REGION;
    
    if (hasAwsKeyId && !hasAwsSecret) {
        errors.push('AWS_SECRET_ACCESS_KEY is required when AWS_ACCESS_KEY_ID is set');
    }
    if (!hasAwsKeyId && hasAwsSecret) {
        errors.push('AWS_ACCESS_KEY_ID is required when AWS_SECRET_ACCESS_KEY is set');
    }
    if ((hasAwsKeyId || hasAwsSecret) && !hasAwsRegion) {
        warnings.push('AWS_REGION is recommended when AWS credentials are configured (defaulting to us-west-2)');
    }
    
    // Validate Stripe configuration
    const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;
    const hasStripeWebhook = !!process.env.STRIPE_WEBHOOK_SECRET;
    
    if (hasStripeKey && !hasStripeWebhook) {
        warnings.push('STRIPE_WEBHOOK_SECRET is required for Stripe webhook verification');
    }
    
    // Validate Google OAuth configuration
    const hasGoogleClientId = !!process.env.GOOGLE_CLIENT_ID;
    const hasGoogleClientSecret = !!process.env.GOOGLE_CLIENT_SECRET;
    
    if (hasGoogleClientId && !hasGoogleClientSecret) {
        warnings.push('GOOGLE_CLIENT_SECRET is recommended for full OAuth flow support');
    }
    
    // Log errors and exit if critical
    if (errors.length > 0) {
        console.error('FATAL: Environment validation errors:');
        errors.forEach(e => console.error(`  - ${e}`));
        process.exit(1);
    }
    
    // Log warnings
    if (warnings.length > 0) {
        console.warn('Warning: Missing optional configuration:');
        warnings.forEach(w => console.warn(`  - ${w}`));
    }
    
    return {
        allPresent: errors.length === 0,
        requiredCount: REQUIRED_ENV_VARS.length,
        optionalCount: OPTIONAL_ENV_VARS.length,
        warnings,
    };
};