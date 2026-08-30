const { Pool } = require('pg');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL?.trim() || '';
const OWNER_NAME = process.env.SEED_OWNER_NAME?.trim() || '';
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const CLEANUP = process.argv.includes('--cleanup');
const SEED = 'communications-ui-20260829';
const PREFIX = 'QA Sample · ';
const EXTERNAL_PREFIX = 'qa-sample-communications';
const HOUR_MS = 60 * 60 * 1000;

const hoursAgo = (hours) => new Date(Date.now() - hours * HOUR_MS);

const contactSamples = [
  {
    firstName: 'Maya',
    lastName: 'Patel',
    email: 'maya.patel@northstar-studio.test',
    phone: '+16025550121',
    company: 'Northstar Studio',
    jobTitle: 'Operations Director',
  },
  {
    firstName: 'Noah',
    lastName: 'Williams',
    email: 'noah.williams@brightline-consulting.test',
    phone: '+16025550122',
    company: 'Brightline Consulting',
    jobTitle: 'Managing Partner',
  },
  {
    firstName: 'Elena',
    lastName: 'Rivera',
    email: 'elena.rivera@meridian-health.test',
    phone: '+16025550123',
    company: 'Meridian Health',
    jobTitle: 'Program Manager',
  },
];

async function resolveTarget(client) {
  const result = await client.query(
    `SELECT users.id AS user_id, users.email, users.name,
            organizations.id AS organization_id,
            organizations.name AS organization_name, organizations.plan
     FROM users
     JOIN organization_members membership ON membership.user_id=users.id
     JOIN organizations ON organizations.id=membership.organization_id
     WHERE ($1 <> '' AND lower(users.email)=lower($1))
        OR ($2 <> '' AND lower(users.name)=lower($2))
     ORDER BY (lower(users.email)=lower($1)) DESC,
              (organizations.id=users.default_organization_id) DESC,
              membership.joined_at, organizations.id
     LIMIT 1`,
    [OWNER_EMAIL, OWNER_NAME],
  );
  if (!result.rows[0]) {
    throw new Error(`No organization membership found for ${OWNER_EMAIL || OWNER_NAME}`);
  }
  return result.rows[0];
}

async function ensureContacts(client, target) {
  const contacts = [];
  for (const sample of contactSamples) {
    const existing = await client.query(
      `SELECT id,first_name,last_name,email,phone
       FROM contacts
       WHERE organization_id=$1 AND lower(email)=lower($2)
       LIMIT 1`,
      [target.organization_id, sample.email],
    );
    if (existing.rows[0]) {
      contacts.push(existing.rows[0]);
      continue;
    }
    const inserted = await client.query(
      `INSERT INTO contacts (
         organization_id,first_name,last_name,email,phone,company,job_title,
         source,status,custom_fields,tags,assigned_to,created_by,created_at,updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'manual','active',$8::jsonb,$9,$10,$10,$11,$11)
       RETURNING id,first_name,last_name,email,phone`,
      [
        target.organization_id,
        sample.firstName,
        sample.lastName,
        sample.email,
        sample.phone,
        sample.company,
        sample.jobTitle,
        JSON.stringify({ seed: SEED }),
        ['sample', 'communications'],
        target.user_id,
        hoursAgo(24 * 14),
      ],
    );
    contacts.push(inserted.rows[0]);
  }
  return contacts;
}

async function insertInboxConversation(client, target, contact, definition) {
  const created = await client.query(
    `INSERT INTO conversations (
       organization_id,contact_id,assigned_to,status,snoozed_until,channel,
       subject,last_message_at,last_message_preview,unread_count,created_at,updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$8)
     RETURNING id`,
    [
      target.organization_id,
      contact.id,
      target.user_id,
      definition.status,
      definition.snoozedUntil || null,
      definition.channel,
      `${PREFIX}${definition.subject}`,
      definition.messages.at(-1).createdAt,
      definition.messages.at(-1).content.slice(0, 200),
      definition.unreadCount,
      definition.messages[0].createdAt,
    ],
  );
  const conversationId = created.rows[0].id;
  const messageIds = [];
  for (const message of definition.messages) {
    const outbound = message.sender === 'user';
    const inserted = await client.query(
      `INSERT INTO messages (
         conversation_id,organization_id,sender_type,sender_user_id,
         sender_contact_id,channel,content,content_html,metadata,is_read,created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
       RETURNING id`,
      [
        conversationId,
        target.organization_id,
        message.sender,
        outbound ? target.user_id : null,
        outbound ? null : contact.id,
        definition.channel,
        message.content,
        definition.channel === 'email' && outbound ? `<p>${message.content}</p>` : null,
        JSON.stringify({
          seed: SEED,
          ...(outbound && message.deliveryStatus
            ? { delivery_status: message.deliveryStatus }
            : {}),
        }),
        outbound || message.isRead !== false,
        message.createdAt,
      ],
    );
    messageIds.push(inserted.rows[0].id);
  }
  return { conversationId, messageIds };
}

async function seedInbox(client, target, contacts) {
  const definitions = [
    {
      contact: 0,
      channel: 'email',
      subject: 'Website redesign kickoff',
      status: 'open',
      unreadCount: 2,
      messages: [
        { sender: 'user', content: 'Hi Maya, I attached the revised project timeline and next steps.', deliveryStatus: 'sent', createdAt: hoursAgo(30) },
        { sender: 'contact', content: 'Thanks! The timeline looks good. Can we move the kickoff to Tuesday?', createdAt: hoursAgo(3), isRead: false },
        { sender: 'contact', content: 'Our design lead is available after 10:00 AM.', createdAt: hoursAgo(2.5), isRead: false },
      ],
    },
    {
      contact: 1,
      channel: 'sms',
      subject: 'Appointment follow-up',
      status: 'open',
      unreadCount: 1,
      messages: [
        { sender: 'user', content: 'Hi Noah, your strategy call is confirmed for tomorrow at 2:00 PM.', deliveryStatus: 'sent', createdAt: hoursAgo(8) },
        { sender: 'contact', content: 'Perfect, thank you. Should I bring the latest campaign numbers?', createdAt: hoursAgo(1.25), isRead: false },
      ],
    },
    {
      contact: 2,
      channel: 'email',
      subject: 'Invoice question',
      status: 'closed',
      unreadCount: 0,
      messages: [
        { sender: 'contact', content: 'Could you clarify the discovery line item on invoice SAMPLE-1001?', createdAt: hoursAgo(120) },
        { sender: 'user', content: 'Absolutely. It covers the stakeholder interviews and requirements workshop.', deliveryStatus: 'sent', createdAt: hoursAgo(118) },
        { sender: 'contact', content: 'That answers it. Thank you!', createdAt: hoursAgo(116) },
      ],
    },
    {
      contact: 0,
      channel: 'chat',
      subject: 'Pricing page question',
      status: 'open',
      unreadCount: 1,
      messages: [
        { sender: 'contact', content: 'Hi! Does the Studio plan include unlimited client portals?', createdAt: hoursAgo(6), isRead: false },
      ],
    },
    {
      contact: 1,
      channel: 'internal',
      subject: 'Proposal handoff',
      status: 'snoozed',
      snoozedUntil: hoursAgo(-24),
      unreadCount: 0,
      messages: [
        { sender: 'user', content: 'Follow up after the proposal review meeting on Monday.', createdAt: hoursAgo(48) },
      ],
    },
    {
      contact: 2,
      channel: 'email',
      subject: 'Delivery status example',
      status: 'open',
      unreadCount: 0,
      messages: [
        { sender: 'user', content: 'Here is the requested program summary for your review.', deliveryStatus: 'failed', createdAt: hoursAgo(20) },
      ],
    },
  ];
  const seeded = [];
  for (const definition of definitions) {
    seeded.push(await insertInboxConversation(
      client,
      target,
      contacts[definition.contact],
      definition,
    ));
  }
  return seeded;
}

async function seedChatWidget(client, target, contacts) {
  const seeded = [];
  let widget = await client.query(
    `SELECT id FROM chat_widgets WHERE organization_id=$1 ORDER BY id LIMIT 1`,
    [target.organization_id],
  );
  if (!widget.rows[0]) {
    widget = await client.query(
      `INSERT INTO chat_widgets (
         organization_id,widget_key,name,is_active,default_assigned_to
       ) VALUES ($1,$2,'Website chat',TRUE,$3)
       RETURNING id`,
      [target.organization_id, `${EXTERNAL_PREFIX}-${target.organization_id}`, target.user_id],
    );
  }
  const widgetId = widget.rows[0].id;
  const sessions = [
    { contact: 0, token: 'maya', status: 'converted', online: false, started: hoursAgo(72), ended: hoursAgo(71.5), page: '/pricing' },
    { contact: 1, token: 'noah', status: 'ended', online: false, started: hoursAgo(26), ended: hoursAgo(25.8), page: '/services' },
    { contact: 2, token: 'elena', status: 'active', online: true, started: hoursAgo(0.5), ended: null, page: '/contact' },
  ];
  for (const session of sessions) {
    const contact = contacts[session.contact];
    const created = await client.query(
      `INSERT INTO chat_sessions (
         organization_id,widget_id,session_token,visitor_name,visitor_email,
         visitor_phone,custom_data,current_page_url,contact_id,status,is_online,
         last_seen_at,started_at,ended_at,created_at,updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14,$13,$12)
       RETURNING id`,
      [
        target.organization_id,
        widgetId,
        `${EXTERNAL_PREFIX}-${target.organization_id}-${session.token}`,
        `${contact.first_name} ${contact.last_name}`,
        contact.email,
        contact.phone,
        JSON.stringify({ seed: SEED }),
        `https://example.test${session.page}`,
        contact.id,
        session.status,
        session.online,
        session.ended || new Date(),
        session.started,
        session.ended,
      ],
    );
    const sessionId = created.rows[0].id;
    const chatMessages = await client.query(
      `INSERT INTO chat_messages (
         session_id,organization_id,sender_type,content,is_read,read_at,created_at
       ) VALUES
         ($1,$2,'visitor',$3,$8,CASE WHEN $8 THEN $5 ELSE NULL END,$4),
         ($1,$2,'agent',$6,TRUE,$7,$7)
       RETURNING id,sender_type,sender_user_id,content,is_read,created_at`,
      [
        sessionId,
        target.organization_id,
        session.contact === 0 ? 'Can you help me choose the right plan?' : session.contact === 1 ? 'Do you offer quarterly strategy sessions?' : 'Is someone available to answer a billing question?',
        session.started,
        hoursAgo((Date.now() - session.started.getTime()) / HOUR_MS - 0.05),
        session.contact === 2 ? 'Yes—happy to help. What would you like to clarify?' : 'Absolutely. Tell me a little about what you need.',
        new Date(session.started.getTime() + 4 * 60 * 1000),
        session.status !== 'active',
      ],
    );
    const conversation = await client.query(
      `INSERT INTO conversations (
         organization_id,contact_id,assigned_to,status,channel,subject,
         last_message_at,last_message_preview,unread_count,created_at,updated_at
       ) VALUES ($1,$2,$3,$4,'chat',$5,$6,$7,$9,$8,$6)
       RETURNING id`,
      [
        target.organization_id,
        contact.id,
        target.user_id,
        session.status === 'active' ? 'open' : 'closed',
        `${PREFIX} · ${contact.first_name} ${contact.last_name}`,
        chatMessages.rows[1].created_at,
        chatMessages.rows[1].content,
        session.started,
        session.status === 'active' ? 1 : 0,
      ],
    );
    const inboxConversationId = conversation.rows[0].id;
    await client.query(
      `UPDATE chat_sessions SET conversation_id=$2 WHERE id=$1`,
      [sessionId, inboxConversationId],
    );
    for (const message of chatMessages.rows) {
      const inboxMessage = await client.query(
        `INSERT INTO messages (
           conversation_id,organization_id,sender_type,sender_user_id,
           sender_contact_id,channel,content,metadata,is_read,created_at
         ) VALUES ($1,$2,$3,$4,$5,'chat',$6,$7::jsonb,$8,$9)
         RETURNING id`,
        [
          inboxConversationId,
          target.organization_id,
          message.sender_type === 'visitor' ? 'contact' : 'user',
          message.sender_type === 'agent' ? target.user_id : null,
          message.sender_type === 'visitor' ? contact.id : null,
          message.content,
          JSON.stringify({
            seed: SEED,
            source: 'chat_widget',
            chat_session_id: sessionId,
            chat_message_id: message.id,
            widget_name: 'Website chat',
            content_type: 'text',
          }),
          message.sender_type !== 'visitor' || message.is_read,
          message.created_at,
        ],
      );
      await client.query(
        `UPDATE chat_messages SET inbox_message_id=$2 WHERE id=$1`,
        [message.id, inboxMessage.rows[0].id],
      );
    }
    seeded.push({
      sessionId,
      conversationId: inboxConversationId,
      contact,
      status: session.status,
      messageId: chatMessages.rows[0].id,
      text: chatMessages.rows[0].content,
    });
  }
  await client.query(
    `UPDATE chat_widgets widget SET
       total_conversations=(SELECT COUNT(*) FROM chat_sessions WHERE widget_id=widget.id),
       total_messages=(SELECT COUNT(*) FROM chat_messages message JOIN chat_sessions session ON session.id=message.session_id WHERE session.widget_id=widget.id),
       updated_at=CURRENT_TIMESTAMP
     WHERE id=$1`,
    [widgetId],
  );
  return seeded;
}

async function seedSocial(client, target, contacts) {
  const seeded = [];
  const channelDefinitions = [
    { type: 'facebook', suffix: 'facebook', name: 'Itemize Demo Page', username: 'itemize.demo', active: true, connected: true },
    { type: 'instagram', suffix: 'instagram', name: 'Itemize Studio', username: 'itemize.studio', active: false, connected: false },
  ];
  for (const channelDefinition of channelDefinitions) {
    const channel = await client.query(
      `INSERT INTO social_channels (
         organization_id,channel_type,external_id,name,username,page_id,
         permissions,is_active,is_connected,webhook_verified,created_by,
         last_synced_at,created_at,updated_at
       ) VALUES ($1,$2,$3,$4,$5,$3,$6, $7,$8,$9,$10,$11,$12,$11)
       RETURNING id`,
      [
        target.organization_id,
        channelDefinition.type,
        `${EXTERNAL_PREFIX}-${channelDefinition.suffix}`,
        channelDefinition.name,
        channelDefinition.username,
        ['pages_messaging'],
        channelDefinition.active,
        channelDefinition.connected,
        channelDefinition.connected,
        target.user_id,
        hoursAgo(0.4),
        hoursAgo(24 * 10),
      ],
    );
    const channelId = channel.rows[0].id;
    const rows = channelDefinition.type === 'facebook'
      ? [
          { contact: 0, name: 'Maya Patel', status: 'open', unread: 2, text: 'Could you send over the workshop dates?', age: 0.75, from: 'participant' },
          { contact: 1, name: 'Noah Williams', status: 'pending', unread: 0, text: 'Thanks for the quick response!', age: 18, from: 'page' },
        ]
      : [
          { contact: 2, name: 'Elena Rivera', status: 'closed', unread: 0, text: 'The new guide was really helpful.', age: 50, from: 'participant' },
        ];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const participantId = `${EXTERNAL_PREFIX}-${channelDefinition.suffix}-${index + 1}`;
      const conversation = await client.query(
        `INSERT INTO social_conversations (
           organization_id,channel_id,thread_id,participant_id,participant_name,
           participant_username,contact_id,status,assigned_to,unread_count,
           message_count,last_message_text,last_message_at,last_message_from,tags,
           created_at,updated_at
         ) VALUES ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,2,$10,$11,$12,$13,$14,$11)
         RETURNING id`,
        [
          target.organization_id,
          channelId,
          participantId,
          row.name,
          `@${row.name.toLowerCase().replace(/\s+/g, '.')}`,
          contacts[row.contact].id,
          row.status,
          target.user_id,
          row.unread,
          row.text,
          hoursAgo(row.age),
          row.from,
          ['sample'],
          hoursAgo(row.age + 4),
        ],
      );
      const conversationId = conversation.rows[0].id;
      const inboxConversation = await client.query(
        `INSERT INTO conversations (
           organization_id,contact_id,assigned_to,status,channel,subject,
           last_message_at,last_message_preview,unread_count,created_at,updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$7)
         RETURNING id`,
        [
          target.organization_id,
          contacts[row.contact].id,
          target.user_id,
          row.status === 'closed' ? 'closed' : 'open',
          channelDefinition.type,
          `${PREFIX} · Social · ${row.name}`,
          hoursAgo(row.age),
          row.text,
          row.unread,
          hoursAgo(row.age + 4),
        ],
      );
      const inboxConversationId = inboxConversation.rows[0].id;
      await client.query(
        `UPDATE social_conversations SET inbox_conversation_id=$2 WHERE id=$1`,
        [conversationId, inboxConversationId],
      );
      const socialMessages = await client.query(
        `INSERT INTO social_messages (
           organization_id,conversation_id,channel_id,external_message_id,
           text_content,direction,sender_id,sender_name,sent_by,status,
           message_timestamp,read_at,created_at
         ) VALUES
           ($1,$2,$3,$4,$5,'outbound',$6,$7,$8,'delivered',$9,$9,$9),
           ($1,$2,$3,$10,$11,'inbound',$12,$13,NULL,$14,$15,$16,$15)
         RETURNING id,direction,text_content,status,message_timestamp`,
        [
          target.organization_id,
          conversationId,
          channelId,
          `${participantId}-outbound`,
          'Thanks for reaching out. How can we help?',
          String(target.user_id),
          target.name || 'Itemize team',
          target.user_id,
          hoursAgo(row.age + 1),
          `${participantId}-inbound`,
          row.text,
          participantId,
          row.name,
          row.unread ? 'delivered' : 'read',
          hoursAgo(row.age),
          row.unread ? null : hoursAgo(Math.max(0, row.age - 0.1)),
        ],
      );
      for (const socialMessage of socialMessages.rows) {
        const inboxMessage = await client.query(
          `INSERT INTO messages (
             conversation_id,organization_id,sender_type,sender_user_id,
             sender_contact_id,channel,content,metadata,is_read,created_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
           RETURNING id`,
          [
            inboxConversationId,
            target.organization_id,
            socialMessage.direction === 'outbound' ? 'user' : 'contact',
            socialMessage.direction === 'outbound' ? target.user_id : null,
            socialMessage.direction === 'inbound' ? contacts[row.contact].id : null,
            channelDefinition.type,
            socialMessage.text_content,
            JSON.stringify({
              seed: SEED,
              source: 'social',
              provider: channelDefinition.type,
              provider_account_name: channelDefinition.name,
              social_conversation_id: conversationId,
              social_message_id: socialMessage.id,
              participant_name: row.name,
              delivery_status: socialMessage.status,
            }),
            socialMessage.direction === 'outbound' || row.unread === 0,
            socialMessage.message_timestamp,
          ],
        );
        await client.query(
          `UPDATE social_messages SET inbox_message_id=$2 WHERE id=$1`,
          [socialMessage.id, inboxMessage.rows[0].id],
        );
      }
      seeded.push({
        conversationId,
        inboxConversationId,
        messageId: `${participantId}-inbound`,
        participantName: row.name,
        text: row.text,
        platform: channelDefinition.type,
        age: row.age,
      });
    }
  }
  return seeded;
}

async function insertNotification(client, target, definition) {
  const event = await client.query(
    `INSERT INTO notification_events (
       organization_id,event_type,entity_type,entity_id,dedupe_key,payload,
       occurred_at,created_at
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)
     RETURNING id`,
    [
      target.organization_id,
      definition.eventType,
      definition.entityType,
      definition.entityId,
      `seed:${SEED}:${definition.key}`,
      JSON.stringify({ seed: SEED, ...definition.payload }),
      definition.occurredAt,
    ],
  );
  await client.query(
    `INSERT INTO user_notifications (
       event_id,organization_id,recipient_user_id,category,priority,
       title,body,href,seen_at,read_at,created_at,updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,
    [
      event.rows[0].id,
      target.organization_id,
      target.user_id,
      definition.category,
      definition.priority,
      definition.title,
      definition.body,
      definition.href,
      definition.seenAt || null,
      definition.readAt || null,
      definition.occurredAt,
    ],
  );
}

async function seedNotifications(client, target, inbox, social, chat) {
  await insertNotification(client, target, {
    key: 'sms-received',
    eventType: 'communication.message_received',
    entityType: 'conversation',
    entityId: inbox[1].conversationId,
    payload: {
      channel: 'sms',
      conversationId: inbox[1].conversationId,
      messageId: inbox[1].messageIds[1],
    },
    category: 'collaboration',
    priority: 'normal',
    title: 'New SMS from Noah Williams',
    body: 'Perfect, thank you. Should I bring the latest campaign numbers?',
    href: `/inbox?conversation=${inbox[1].conversationId}`,
    occurredAt: hoursAgo(1.25),
  });
  await insertNotification(client, target, {
    key: 'social-received',
    eventType: 'communication.message_received',
    entityType: 'conversation',
    entityId: social[0].inboxConversationId,
    payload: {
      channel: social[0].platform,
      conversationId: social[0].inboxConversationId,
      socialConversationId: social[0].conversationId,
      externalMessageId: social[0].messageId,
    },
    category: 'collaboration',
    priority: 'normal',
    title: 'New Facebook message',
    body: `${social[0].participantName}: ${social[0].text}`,
    href: `/inbox?conversation=${social[0].inboxConversationId}`,
    occurredAt: hoursAgo(social[0].age),
  });
  const activeChat = chat.find(session => session.status === 'active');
  if (activeChat) {
    await insertNotification(client, target, {
      key: 'chat-received',
      eventType: 'communication.message_received',
      entityType: 'conversation',
      entityId: activeChat.conversationId,
      payload: {
        channel: 'chat',
        conversationId: activeChat.conversationId,
        chatSessionId: activeChat.sessionId,
        chatMessageId: activeChat.messageId,
      },
      category: 'business',
      priority: 'normal',
      title: 'New website chat',
      body: `${activeChat.contact.first_name} ${activeChat.contact.last_name}: ${activeChat.text}`,
      href: `/inbox?conversation=${activeChat.conversationId}`,
      occurredAt: hoursAgo(0.5),
    });
  }
  await insertNotification(client, target, {
    key: 'delivery-failed',
    eventType: 'communication.delivery_failed',
    entityType: 'conversation',
    entityId: inbox[5].conversationId,
    payload: {
      channel: 'email',
      conversationId: inbox[5].conversationId,
      messageId: inbox[5].messageIds[0],
      state: 'failed',
    },
    category: 'business',
    priority: 'high',
    title: 'Email delivery failed',
    body: 'Your message to Elena Rivera could not be delivered.',
    href: `/inbox?conversation=${inbox[5].conversationId}`,
    occurredAt: hoursAgo(20),
    seenAt: hoursAgo(19),
  });
}

async function removeSamples(client, organizationId) {
  const removed = {};
  removed.notifications = Number((await client.query(
    `WITH deleted AS (
       DELETE FROM notification_events
       WHERE organization_id=$1 AND payload->>'seed'=$2 RETURNING 1
     ) SELECT COUNT(*)::int AS count FROM deleted`,
    [organizationId, SEED],
  )).rows[0].count);
  removed.socialChannels = Number((await client.query(
    `WITH deleted AS (
       DELETE FROM social_channels
       WHERE organization_id=$1 AND external_id LIKE $2 RETURNING 1
     ) SELECT COUNT(*)::int AS count FROM deleted`,
    [organizationId, `${EXTERNAL_PREFIX}%`],
  )).rows[0].count);
  removed.chatSessions = Number((await client.query(
    `WITH deleted AS (
       DELETE FROM chat_sessions
       WHERE organization_id=$1 AND custom_data->>'seed'=$2 RETURNING 1
     ) SELECT COUNT(*)::int AS count FROM deleted`,
    [organizationId, SEED],
  )).rows[0].count);
  removed.conversations = Number((await client.query(
    `WITH deleted AS (
       DELETE FROM conversations
       WHERE organization_id=$1 AND subject LIKE $2 RETURNING 1
     ) SELECT COUNT(*)::int AS count FROM deleted`,
    [organizationId, `${PREFIX}%`],
  )).rows[0].count);
  removed.contacts = Number((await client.query(
    `WITH deleted AS (
       DELETE FROM contacts
       WHERE organization_id=$1 AND custom_fields->>'seed'=$2 RETURNING 1
     ) SELECT COUNT(*)::int AS count FROM deleted`,
    [organizationId, SEED],
  )).rows[0].count);
  await client.query(
    `UPDATE chat_widgets widget SET
       total_conversations=(SELECT COUNT(*) FROM chat_sessions WHERE widget_id=widget.id),
       total_messages=(SELECT COUNT(*) FROM chat_messages message JOIN chat_sessions session ON session.id=message.session_id WHERE session.widget_id=widget.id),
       updated_at=CURRENT_TIMESTAMP
     WHERE organization_id=$1`,
    [organizationId],
  );
  return removed;
}

async function counts(client, organizationId) {
  const result = await client.query(
    `SELECT
       (SELECT COUNT(*) FROM conversations WHERE organization_id=$1 AND subject LIKE $2)::int AS conversations,
       (SELECT COUNT(*) FROM messages WHERE organization_id=$1 AND metadata->>'seed'=$3)::int AS messages,
       (SELECT COUNT(*) FROM chat_sessions WHERE organization_id=$1 AND custom_data->>'seed'=$3)::int AS chat_sessions,
       (SELECT COUNT(*) FROM social_channels WHERE organization_id=$1 AND external_id LIKE $4)::int AS social_channels,
       (SELECT COUNT(*) FROM social_conversations conversation JOIN social_channels channel ON channel.id=conversation.channel_id WHERE conversation.organization_id=$1 AND channel.external_id LIKE $4)::int AS social_conversations,
       (SELECT COUNT(*) FROM contacts WHERE organization_id=$1 AND custom_fields->>'seed'=$3)::int AS contacts,
       (SELECT COUNT(*) FROM user_notifications notification JOIN notification_events event ON event.id=notification.event_id WHERE notification.organization_id=$1 AND event.payload->>'seed'=$3)::int AS notifications`,
    [organizationId, `${PREFIX}%`, SEED, `${EXTERNAL_PREFIX}%`],
  );
  return result.rows[0];
}

async function main() {
  if ([DRY_RUN, APPLY, CLEANUP].filter(Boolean).length !== 1) {
    throw new Error('Choose exactly one mode: --dry-run, --apply, or --cleanup');
  }
  if (!OWNER_EMAIL && !OWNER_NAME) {
    throw new Error('SEED_OWNER_EMAIL or SEED_OWNER_NAME is required');
  }
  const connectionString = process.env.SEED_DATABASE_URL
    || process.env.DATABASE_PUBLIC_URL
    || process.env.DATABASE_URL;
  if (!connectionString) throw new Error('A database connection URL is required');

  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    const target = await resolveTarget(client);
    console.log(JSON.stringify({
      mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'cleanup',
      target: {
        email: target.email,
        organizationId: Number(target.organization_id),
        organizationName: target.organization_name,
        plan: target.plan,
      },
      existing: await counts(client, target.organization_id),
      planned: DRY_RUN || APPLY
        ? { contacts: 3, conversations: 12, inboxMessages: 23, chatSessions: 3, socialChannels: 2, socialConversations: 3, notifications: 4 }
        : undefined,
    }, null, 2));
    if (DRY_RUN) return;

    await client.query('BEGIN');
    try {
      const removed = await removeSamples(client, target.organization_id);
      if (CLEANUP) {
        await client.query('COMMIT');
        console.log(JSON.stringify({ removed }, null, 2));
        return;
      }
      const contacts = await ensureContacts(client, target);
      const inbox = await seedInbox(client, target, contacts);
      const chat = await seedChatWidget(client, target, contacts);
      const social = await seedSocial(client, target, contacts);
      await seedNotifications(client, target, inbox, social, chat);
      await client.query('COMMIT');
      console.log(JSON.stringify({ removed, seeded: await counts(client, target.organization_id) }, null, 2));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
