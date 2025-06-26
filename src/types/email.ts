export interface Email {
  id: string
  user_id: string
  from_address: string
  subject: string
  date: string
  body: string
  ai_risk_level: 'Lav' | 'Medium' | 'Høy' | null
  ai_reason: string | null
  source: 'gmail' | 'outlook'
  message_id: string
  analyzed_at: string | null
  created_at: string
  user_email?: string
} 