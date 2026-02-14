import api from './api'

const unwrapResponse = <T>(payload: any): T => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data as T
  }
  return payload as T
}

export const invoicesApi = {
  getInvoices: async (params?: {
    search?: string
    limit?: number
    status?: string
    contact_id?: number
  }) => {
    const response = await api.get('/api/invoices', { params })
    return unwrapResponse(response.data)
  },

  getInvoice: async (id: string) => {
    const response = await api.get(`/api/invoices/${id}`)
    return unwrapResponse(response.data)
  },

  createInvoice: async (data: any) => {
    const response = await api.post('/api/invoices', data)
    return unwrapResponse(response.data)
  },

  updateInvoice: async (id: string, data: any) => {
    const response = await api.put(`/api/invoices/${id}`, data)
    return unwrapResponse(response.data)
  },

  deleteInvoice: async (id: string) => {
    const response = await api.delete(`/api/invoices/${id}`)
    return unwrapResponse(response.data)
  },
}

export const signaturesApi = {
  getSignatures: async (params?: {
    search?: string
    limit?: number
    status?: string
    contact_id?: number
  }) => {
    const response = await api.get('/api/signatures', { params })
    return unwrapResponse(response.data)
  },

  getSignature: async (id: string) => {
    const response = await api.get(`/api/signatures/${id}`)
    return unwrapResponse(response.data)
  },

  createSignature: async (data: any) => {
    const response = await api.post('/api/signatures', data)
    return unwrapResponse(response.data)
  },

  updateSignature: async (id: string, data: any) => {
    const response = await api.put(`/api/signatures/${id}`, data)
    return unwrapResponse(response.data)
  },

  sendSignature: async (id: string) => {
    const response = await api.post(`/api/signatures/${id}/send`)
    return unwrapResponse(response.data)
  },
}

export const workflowsApi = {
  getWorkflows: async (params?: { search?: string; limit?: number }) => {
    const response = await api.get('/api/workflows', { params })
    return unwrapResponse(response.data)
  },

  getWorkflow: async (id: string) => {
    const response = await api.get(`/api/workflows/${id}`)
    return unwrapResponse(response.data)
  },

  createWorkflow: async (data: any) => {
    const response = await api.post('/api/workflows', data)
    return unwrapResponse(response.data)
  },

  updateWorkflow: async (id: string, data: any) => {
    const response = await api.put(`/api/workflows/${id}`, data)
    return unwrapResponse(response.data)
  },

  activateWorkflow: async (id: string) => {
    const response = await api.post(`/api/workflows/${id}/activate`)
    return unwrapResponse(response.data)
  },

  deactivateWorkflow: async (id: string) => {
    const response = await api.post(`/api/workflows/${id}/deactivate`)
    return unwrapResponse(response.data)
  },

  triggerWorkflow: async (id: string, eventType: string, eventData: any) => {
    const response = await api.post('/api/workflows/${id}/trigger', { eventType, eventData })
    return unwrapResponse(response.data)
  },
}

export const searchApi = {
  search: async (params: { q: string; types?: string[]; limit?: number }) => {
    const response = await api.post('/api/search', params)
    return unwrapResponse(response.data)
  },
}

export default {
  invoices: invoicesApi,
  signatures: signaturesApi,
  workflows: workflowsApi,
  search: searchApi,
}