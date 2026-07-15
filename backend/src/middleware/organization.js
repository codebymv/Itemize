/**
 * Organization Middleware
 * Shared middleware for organization context and authorization
 * Extracted from route files to reduce duplication (~600 lines saved)
 */

/**
 * Create organization middleware with pool dependency
 * @param {Object} pool - Database connection pool
 * @returns {Object} Middleware functions
 */
module.exports = (pool) => {
    const requestedOrganizationId = (req) =>
        req.query?.organization_id ??
        req.body?.organization_id ??
        req.headers['x-organization-id'];

    const parseOrganizationId = (value) => {
        if (value === undefined || value === null || value === '') return null;
        const normalized = String(value).trim();
        if (!/^[1-9]\d*$/.test(normalized)) return NaN;
        const parsed = Number(normalized);
        return Number.isSafeInteger(parsed) ? parsed : NaN;
    };
    
    /**
     * Middleware to require organization context
     * - Validates organization_id from query, body, or header
     * - Falls back to user's default organization
     * - Verifies user membership in the organization
     * - Sets req.organizationId and req.orgRole
     */
    const requireOrganization = async (req, res, next) => {
        try {
            if (!req.user?.id) {
                return res.status(401).json({
                    error: 'Authentication required',
                    code: 'AUTH_REQUIRED'
                });
            }

            const organizationId = parseOrganizationId(requestedOrganizationId(req));
            if (Number.isNaN(organizationId)) {
                return res.status(400).json({
                    error: 'Organization ID must be a positive integer',
                    code: 'INVALID_ORGANIZATION_ID'
                });
            }

            const client = await pool.connect();
            
            try {
                let orgId;
                let role;

                if (organizationId !== null) {
                    orgId = organizationId;
                    
                    // Verify membership
                    const memberResult = await client.query(
                        'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
                        [orgId, req.user.id]
                    );

                    if (memberResult.rows.length === 0) {
                        return res.status(403).json({ error: 'Not a member of this organization' });
                    }

                    role = memberResult.rows[0].role;
                } else {
                    // Optimized single query: get default org and verify membership
                    const result = await client.query(`
                        SELECT u.default_organization_id, om.role
                        FROM users u
                        LEFT JOIN organization_members om 
                            ON om.organization_id = u.default_organization_id 
                            AND om.user_id = u.id
                        WHERE u.id = $1
                    `, [req.user.id]);

                    if (result.rows.length === 0 || !result.rows[0].default_organization_id) {
                        return res.status(400).json({ 
                            error: 'Organization ID required. Set a default organization or provide organization_id.' 
                        });
                    }

                    if (!result.rows[0].role) {
                        return res.status(403).json({ error: 'Not a member of default organization' });
                    }

                    orgId = result.rows[0].default_organization_id;
                    role = result.rows[0].role;
                }

                req.organizationId = orgId;
                req.orgRole = role;
                next();
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Error in requireOrganization middleware:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    };

    /**
     * Middleware to require specific organization roles
     * Must be used after requireOrganization
     * @param {...string} allowedRoles - Roles that are allowed (e.g., 'owner', 'admin')
     */
    const requireRole = (...allowedRoles) => {
        return (req, res, next) => {
            if (!req.orgRole) {
                return res.status(500).json({ error: 'requireRole must be used after requireOrganization' });
            }

            if (!allowedRoles.includes(req.orgRole)) {
                return res.status(403).json({ 
                    error: `Insufficient permissions. Required roles: ${allowedRoles.join(', ')}` 
                });
            }

            next();
        };
    };

    /**
     * Middleware to optionally resolve organization context
     * Does not fail if organization is not found, just doesn't set it
     * Useful for endpoints that can work with or without org context
     */
    const optionalOrganization = async (req, res, next) => {
        try {
            if (!req.user?.id) return next();

            const organizationId = parseOrganizationId(requestedOrganizationId(req));
            if (organizationId === null || Number.isNaN(organizationId)) return next();

            const client = await pool.connect();
            
            try {
                const memberResult = await client.query(
                    'SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2',
                    [organizationId, req.user.id]
                );

                if (memberResult.rows.length > 0) {
                    req.organizationId = organizationId;
                    req.orgRole = memberResult.rows[0].role;
                }
            } finally {
                client.release();
            }

            next();
        } catch (error) {
            console.error('Error in optionalOrganization middleware:', error);
            next(); // Don't fail, just continue without org context
        }
    };

    return {
        requireOrganization,
        requireRole,
        optionalOrganization
    };
};
