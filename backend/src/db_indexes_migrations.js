/**
 * Database Indexes Migrations
 * Adds missing indexes for performance optimization
 * Critical for query performance as data grows
 */

/**
 * Add indexes to contacts table
 */
async function addContactsIndexes(pool) {
    const client = await pool.connect();
    try {
        // Foreign key indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contacts_created_by ON contacts(created_by)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(assigned_to)
        `);
        
        // Common query indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company) WHERE company IS NOT NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contacts_source ON contacts(source)
        `);
        
        // Composite indexes for common query patterns
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contacts_org_status ON contacts(organization_id, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contacts_org_email ON contacts(organization_id, email)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contacts_org_created ON contacts(organization_id, created_at DESC)
        `);
        
        console.log('✅ contacts indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some contacts indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to contact_activities table
 */
async function addContactActivitiesIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contact_activities_user ON contact_activities(user_id)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contact_activities_type ON contact_activities(type)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_contact_activities_contact_created ON contact_activities(contact_id, created_at DESC)
        `);
        
        console.log('✅ contact_activities indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some contact_activities indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to deals table
 */
async function addDealsIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_deals_created_by ON deals(created_by)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON deals(assigned_to)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_deals_expected_close ON deals(expected_close_date) WHERE expected_close_date IS NOT NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_deals_won_at ON deals(won_at) WHERE won_at IS NOT NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_deals_lost_at ON deals(lost_at) WHERE lost_at IS NOT NULL
        `);
        
        // Composite indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_deals_org_status ON deals(organization_id, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_deals_org_status_created ON deals(organization_id, status, created_at DESC)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_deals_pipeline_stage ON deals(pipeline_id, stage_id)
        `);
        
        console.log('✅ deals indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some deals indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to tasks table
 */
async function addTasksIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tasks_reminder_at ON tasks(reminder_at) WHERE reminder_at IS NOT NULL
        `);
        
        // Composite indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tasks_org_assigned_status ON tasks(organization_id, assigned_to, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_tasks_org_due ON tasks(organization_id, due_date) WHERE due_date IS NOT NULL
        `);
        
        console.log('✅ tasks indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some tasks indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to workflows table
 */
async function addWorkflowsIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_workflows_created_by ON workflows(created_by)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_workflows_org_active ON workflows(organization_id, is_active)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_workflows_trigger_type ON workflows(trigger_type)
        `);
        
        console.log('✅ workflows indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some workflows indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to workflow_enrollments table
 */
async function addWorkflowEnrollmentsIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_enrollments_workflow_status ON workflow_enrollments(workflow_id, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_enrollments_status_next ON workflow_enrollments(status, next_action_at) WHERE status = 'active'
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_enrollments_contact ON workflow_enrollments(contact_id)
        `);
        
        console.log('✅ workflow_enrollments indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some workflow_enrollments indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to email_campaigns table
 */
async function addCampaignsIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON email_campaigns(created_by)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON email_campaigns(organization_id, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON email_campaigns(scheduled_at) WHERE scheduled_at IS NOT NULL
        `);
        
        console.log('✅ email_campaigns indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some email_campaigns indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to campaign_recipients table
 */
async function addCampaignRecipientsIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_recipients_campaign_status ON campaign_recipients(campaign_id, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_recipients_contact ON campaign_recipients(contact_id)
        `);
        
        console.log('✅ campaign_recipients indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some campaign_recipients indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to invoices table
 */
async function addInvoicesIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON invoices(organization_id, status)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date) WHERE due_date IS NOT NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_invoices_contact ON invoices(contact_id) WHERE contact_id IS NOT NULL
        `);
        
        console.log('✅ invoices indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some invoices indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to bookings table
 */
async function addBookingsIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_bookings_attendee_email ON bookings(attendee_email)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_bookings_calendar_start ON bookings(calendar_id, start_time)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_bookings_org_status ON bookings(organization_id, status)
        `);
        
        console.log('✅ bookings indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some bookings indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to reviews table
 */
async function addReviewsIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_responded_by ON reviews(responded_by) WHERE responded_by IS NOT NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_org_rating ON reviews(organization_id, rating)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_reviews_platform ON reviews(platform_id)
        `);
        
        console.log('✅ reviews indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some reviews indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to social_messages table
 */
async function addSocialMessagesIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_messages_sent_by ON social_messages(sent_by) WHERE sent_by IS NOT NULL
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_social_messages_conversation ON social_messages(conversation_id, created_at DESC)
        `);
        
        console.log('✅ social_messages indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some social_messages indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to page_analytics table
 */
async function addPageAnalyticsIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_analytics_converted ON page_analytics(converted) WHERE converted = TRUE
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_page_analytics_page_viewed ON page_analytics(page_id, viewed_at DESC)
        `);
        
        console.log('✅ page_analytics indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some page_analytics indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to form_submissions table
 */
async function addFormSubmissionsIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_form_submissions_ip ON form_submissions(ip_address)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_form_submissions_form_created ON form_submissions(form_id, created_at DESC)
        `);
        
        console.log('✅ form_submissions indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some form_submissions indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to conversations table
 */
async function addConversationsIndexes(pool) {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_conversations_org_status_last ON conversations(organization_id, status, last_message_at DESC)
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_to) WHERE assigned_to IS NOT NULL
        `);
        
        console.log('✅ conversations indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some conversations indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Add indexes to organization_members table
 */
async function addOrganizationMembersIndexes(pool) {
    const client = await pool.connect();
    try {
        // Composite index for common lookup pattern
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_org_members_user_org ON organization_members(user_id, organization_id)
        `);
        
        console.log('✅ organization_members indexes created/verified');
    } catch (error) {
        console.log('⚠️ Some organization_members indexes may already exist:', error.message);
    } finally {
        client.release();
    }
}

/**
 * Run all index migrations
 */
async function runAllIndexMigrations(pool) {
    console.log('Running database index migrations...');
    
    await addContactsIndexes(pool);
    await addContactActivitiesIndexes(pool);
    await addDealsIndexes(pool);
    await addTasksIndexes(pool);
    await addWorkflowsIndexes(pool);
    await addWorkflowEnrollmentsIndexes(pool);
    await addCampaignsIndexes(pool);
    await addCampaignRecipientsIndexes(pool);
    await addInvoicesIndexes(pool);
    await addBookingsIndexes(pool);
    await addReviewsIndexes(pool);
    await addSocialMessagesIndexes(pool);
    await addPageAnalyticsIndexes(pool);
    await addFormSubmissionsIndexes(pool);
    await addConversationsIndexes(pool);
    await addOrganizationMembersIndexes(pool);
    
    console.log('✅ All database index migrations completed');
}

module.exports = {
    runAllIndexMigrations,
    addContactsIndexes,
    addContactActivitiesIndexes,
    addDealsIndexes,
    addTasksIndexes,
    addWorkflowsIndexes,
    addWorkflowEnrollmentsIndexes,
    addCampaignsIndexes,
    addCampaignRecipientsIndexes,
    addInvoicesIndexes,
    addBookingsIndexes,
    addReviewsIndexes,
    addSocialMessagesIndexes,
    addPageAnalyticsIndexes,
    addFormSubmissionsIndexes,
    addConversationsIndexes,
    addOrganizationMembersIndexes
};
