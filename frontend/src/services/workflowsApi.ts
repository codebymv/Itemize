import api from '@/lib/api'

export const workflowsApi = {
  getAll: async () => {
    const response = await api.get('/api/workflows')
    return response.data.data
  },

  getById: async (id: string) => {
    const response = await api.get(`/api/workflows/${id}`)
    return response.data.data
  },

  create: async (workflow: any) => {
    const response = await api.post('/api/workflows', workflow)
    return response.data.data
  },

  update: async (id: string, updates: any) => {
    const response = await api.put(`/api/workflows/${id}`, updates)
    return response.data.data
  },

  activate: async (id: string) => {
    const response = await api.post(`/api/workflows/${id}/activate`)
    return response.data.data
  },

  deactivate: async (id: string) => {
    const response = await api.post(`/api/workflows/${id}/deactivate`)
    return response.data.data
  },

  trigger: async ({ workflowId, eventType, data }: { workflowId: string; eventType: string; data: any }) => {
    const response = await api.post(`/api/webhooks/${workflowId}`, { eventType, data })
    return response.data
  },

  getWebhook: async (webhookId: string) => {
    const response = await api.get(`/api/webhooks/${webhookId}`)
    return response.data
  },

  testTrigger: async ({ workflowId, eventType }: { workflowId: string; eventType: string }) => {
    const response = await api.post(`/api/workflows/${workflowId}/test`, { eventType })
    return response.data
  },
}

export default workflowsApi