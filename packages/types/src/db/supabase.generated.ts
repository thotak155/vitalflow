export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_completions: {
        Row: {
          completion_tokens: number | null
          content: string
          created_at: string
          finish_reason: string | null
          id: string
          latency_ms: number | null
          request_id: string
          tenant_id: string
          total_tokens: number | null
        }
        Insert: {
          completion_tokens?: number | null
          content: string
          created_at?: string
          finish_reason?: string | null
          id?: string
          latency_ms?: number | null
          request_id: string
          tenant_id: string
          total_tokens?: number | null
        }
        Update: {
          completion_tokens?: number | null
          content?: string
          created_at?: string
          finish_reason?: string | null
          id?: string
          latency_ms?: number | null
          request_id?: string
          tenant_id?: string
          total_tokens?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_completions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_completions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_embeddings: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string
          id: string
          metadata: Json
          model: string
          source_id: string
          source_schema: string
          source_table: string
          tenant_id: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          embedding: string
          id?: string
          metadata?: Json
          model: string
          source_id: string
          source_schema: string
          source_table: string
          tenant_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string
          id?: string
          metadata?: Json
          model?: string
          source_id?: string
          source_schema?: string
          source_table?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_embeddings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feedback: {
        Row: {
          comment: string | null
          correction: string | null
          created_at: string
          id: string
          rating: number
          request_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          comment?: string | null
          correction?: string | null
          created_at?: string
          id?: string
          rating: number
          request_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          comment?: string | null
          correction?: string | null
          created_at?: string
          id?: string
          rating?: number
          request_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_requests: {
        Row: {
          completed_at: string | null
          correlation_id: string | null
          cost_micros_usd: number | null
          created_at: string
          error_message: string | null
          id: string
          model: string
          prompt_hash: string
          prompt_tokens: number | null
          provider: Database["public"]["Enums"]["ai_provider"]
          redacted_context: Json | null
          safety_reason: string | null
          safety_verdict: Database["public"]["Enums"]["ai_safety_verdict"]
          started_at: string
          status: Database["public"]["Enums"]["ai_request_status"]
          surface: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          correlation_id?: string | null
          cost_micros_usd?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          model: string
          prompt_hash: string
          prompt_tokens?: number | null
          provider: Database["public"]["Enums"]["ai_provider"]
          redacted_context?: Json | null
          safety_reason?: string | null
          safety_verdict?: Database["public"]["Enums"]["ai_safety_verdict"]
          started_at?: string
          status?: Database["public"]["Enums"]["ai_request_status"]
          surface: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          correlation_id?: string | null
          cost_micros_usd?: number | null
          created_at?: string
          error_message?: string | null
          id?: string
          model?: string
          prompt_hash?: string
          prompt_tokens?: number | null
          provider?: Database["public"]["Enums"]["ai_provider"]
          redacted_context?: Json | null
          safety_reason?: string | null
          safety_verdict?: Database["public"]["Enums"]["ai_safety_verdict"]
          started_at?: string
          status?: Database["public"]["Enums"]["ai_request_status"]
          surface?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      allergies: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          notes: string | null
          onset_date: string | null
          patient_id: string
          reaction: string | null
          recorded_by: string | null
          severity: Database["public"]["Enums"]["allergy_severity"] | null
          substance: string
          substance_code: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["allergy_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          onset_date?: string | null
          patient_id: string
          reaction?: string | null
          recorded_by?: string | null
          severity?: Database["public"]["Enums"]["allergy_severity"] | null
          substance: string
          substance_code?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["allergy_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          notes?: string | null
          onset_date?: string | null
          patient_id?: string
          reaction?: string | null
          recorded_by?: string | null
          severity?: Database["public"]["Enums"]["allergy_severity"] | null
          substance?: string
          substance_code?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["allergy_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allergies_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allergies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          booked_by: string | null
          cancelled_at: string | null
          cancelled_reason: string | null
          created_at: string
          encounter_id: string | null
          end_at: string
          id: string
          location_id: string | null
          metadata: Json
          patient_id: string
          provider_id: string
          reason: string | null
          start_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          telehealth_url: string | null
          tenant_id: string
          updated_at: string
          visit_type: string | null
        }
        Insert: {
          booked_by?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          encounter_id?: string | null
          end_at: string
          id?: string
          location_id?: string | null
          metadata?: Json
          patient_id: string
          provider_id: string
          reason?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          telehealth_url?: string | null
          tenant_id: string
          updated_at?: string
          visit_type?: string | null
        }
        Update: {
          booked_by?: string | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          encounter_id?: string | null
          end_at?: string
          id?: string
          location_id?: string | null
          metadata?: Json
          patient_id?: string
          provider_id?: string
          reason?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          telehealth_url?: string | null
          tenant_id?: string
          updated_at?: string
          visit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          category: string | null
          created_at: string
          deleted_at: string | null
          encounter_id: string | null
          id: string
          label: string | null
          metadata: Json
          mime_type: string
          patient_id: string | null
          sha256: string | null
          size_bytes: number
          storage_bucket: string
          storage_path: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          encounter_id?: string | null
          id?: string
          label?: string | null
          metadata?: Json
          mime_type: string
          patient_id?: string | null
          sha256?: string | null
          size_bytes: number
          storage_bucket: string
          storage_path: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          deleted_at?: string | null
          encounter_id?: string | null
          id?: string
          label?: string | null
          metadata?: Json
          mime_type?: string
          patient_id?: string | null
          sha256?: string | null
          size_bytes?: number
          storage_bucket?: string
          storage_path?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          cpt_code: string | null
          created_at: string
          currency: string
          encounter_id: string | null
          hcpcs_code: string | null
          icd10_codes: string[]
          id: string
          metadata: Json
          modifiers: string[]
          notes: string | null
          order_id: string | null
          patient_id: string
          posted_at: string | null
          posted_by: string | null
          revenue_code: string | null
          service_date: string
          status: string
          tenant_id: string
          total_minor: number
          unit_price_minor: number
          units: number
          updated_at: string
        }
        Insert: {
          cpt_code?: string | null
          created_at?: string
          currency?: string
          encounter_id?: string | null
          hcpcs_code?: string | null
          icd10_codes?: string[]
          id?: string
          metadata?: Json
          modifiers?: string[]
          notes?: string | null
          order_id?: string | null
          patient_id: string
          posted_at?: string | null
          posted_by?: string | null
          revenue_code?: string | null
          service_date: string
          status?: string
          tenant_id: string
          total_minor?: number
          unit_price_minor: number
          units?: number
          updated_at?: string
        }
        Update: {
          cpt_code?: string | null
          created_at?: string
          currency?: string
          encounter_id?: string | null
          hcpcs_code?: string | null
          icd10_codes?: string[]
          id?: string
          metadata?: Json
          modifiers?: string[]
          notes?: string | null
          order_id?: string | null
          patient_id?: string
          posted_at?: string | null
          posted_by?: string | null
          revenue_code?: string | null
          service_date?: string
          status?: string
          tenant_id?: string
          total_minor?: number
          unit_price_minor?: number
          units?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_lines: {
        Row: {
          adjustment_minor: number | null
          allowed_minor: number | null
          charge_id: string | null
          charge_minor: number
          claim_id: string
          cpt_code: string | null
          created_at: string
          currency: string
          denial_codes: string[]
          icd10_codes: string[]
          id: string
          line_number: number
          modifiers: string[]
          paid_minor: number | null
          service_date: string
          tenant_id: string
          units: number
        }
        Insert: {
          adjustment_minor?: number | null
          allowed_minor?: number | null
          charge_id?: string | null
          charge_minor: number
          claim_id: string
          cpt_code?: string | null
          created_at?: string
          currency?: string
          denial_codes?: string[]
          icd10_codes?: string[]
          id?: string
          line_number: number
          modifiers?: string[]
          paid_minor?: number | null
          service_date: string
          tenant_id: string
          units?: number
        }
        Update: {
          adjustment_minor?: number | null
          allowed_minor?: number | null
          charge_id?: string | null
          charge_minor?: number
          claim_id?: string
          cpt_code?: string | null
          created_at?: string
          currency?: string
          denial_codes?: string[]
          icd10_codes?: string[]
          id?: string
          line_number?: number
          modifiers?: string[]
          paid_minor?: number | null
          service_date?: string
          tenant_id?: string
          units?: number
        }
        Relationships: [
          {
            foreignKeyName: "claim_lines_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_lines_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_status_history: {
        Row: {
          actor_id: string | null
          claim_id: string
          from_status: Database["public"]["Enums"]["claim_status"] | null
          id: string
          message: string | null
          occurred_at: string
          payload: Json | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["claim_status"]
        }
        Insert: {
          actor_id?: string | null
          claim_id: string
          from_status?: Database["public"]["Enums"]["claim_status"] | null
          id?: string
          message?: string | null
          occurred_at?: string
          payload?: Json | null
          tenant_id: string
          to_status: Database["public"]["Enums"]["claim_status"]
        }
        Update: {
          actor_id?: string | null
          claim_id?: string
          from_status?: Database["public"]["Enums"]["claim_status"] | null
          id?: string
          message?: string | null
          occurred_at?: string
          payload?: Json | null
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["claim_status"]
        }
        Relationships: [
          {
            foreignKeyName: "claim_status_history_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_status_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          adjudicated_at: string | null
          allowed_minor: number | null
          billing_provider_id: string | null
          coverage_id: string | null
          created_at: string
          currency: string
          edi_envelope: string | null
          external_claim_id: string | null
          id: string
          metadata: Json
          number: string
          paid_minor: number | null
          patient_id: string
          patient_resp_minor: number | null
          payer_id: string
          rendering_provider_id: string | null
          service_end_date: string
          service_start_date: string
          status: Database["public"]["Enums"]["claim_status"]
          submitted_at: string | null
          tenant_id: string
          total_minor: number
          updated_at: string
        }
        Insert: {
          adjudicated_at?: string | null
          allowed_minor?: number | null
          billing_provider_id?: string | null
          coverage_id?: string | null
          created_at?: string
          currency?: string
          edi_envelope?: string | null
          external_claim_id?: string | null
          id?: string
          metadata?: Json
          number?: string
          paid_minor?: number | null
          patient_id: string
          patient_resp_minor?: number | null
          payer_id: string
          rendering_provider_id?: string | null
          service_end_date: string
          service_start_date: string
          status?: Database["public"]["Enums"]["claim_status"]
          submitted_at?: string | null
          tenant_id: string
          total_minor?: number
          updated_at?: string
        }
        Update: {
          adjudicated_at?: string | null
          allowed_minor?: number | null
          billing_provider_id?: string | null
          coverage_id?: string | null
          created_at?: string
          currency?: string
          edi_envelope?: string | null
          external_claim_id?: string | null
          id?: string
          metadata?: Json
          number?: string
          paid_minor?: number | null
          patient_id?: string
          patient_resp_minor?: number | null
          payer_id?: string
          rendering_provider_id?: string | null
          service_end_date?: string
          service_start_date?: string
          status?: Database["public"]["Enums"]["claim_status"]
          submitted_at?: string | null
          tenant_id?: string
          total_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_coverage_id_fkey"
            columns: ["coverage_id"]
            isOneToOne: false
            referencedRelation: "patient_coverages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "payers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      encounter_notes: {
        Row: {
          ai_assisted: boolean
          ai_request_id: string | null
          amended_from: string | null
          assessment: string | null
          author_id: string
          created_at: string
          encounter_id: string
          free_text: string | null
          id: string
          objective: string | null
          patient_id: string
          plan: string | null
          signed_at: string | null
          signed_by: string | null
          status: Database["public"]["Enums"]["note_status"]
          subjective: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["note_type"]
          updated_at: string
          version: number
        }
        Insert: {
          ai_assisted?: boolean
          ai_request_id?: string | null
          amended_from?: string | null
          assessment?: string | null
          author_id: string
          created_at?: string
          encounter_id: string
          free_text?: string | null
          id?: string
          objective?: string | null
          patient_id: string
          plan?: string | null
          signed_at?: string | null
          signed_by?: string | null
          status?: Database["public"]["Enums"]["note_status"]
          subjective?: string | null
          tenant_id: string
          type?: Database["public"]["Enums"]["note_type"]
          updated_at?: string
          version?: number
        }
        Update: {
          ai_assisted?: boolean
          ai_request_id?: string | null
          amended_from?: string | null
          assessment?: string | null
          author_id?: string
          created_at?: string
          encounter_id?: string
          free_text?: string | null
          id?: string
          objective?: string | null
          patient_id?: string
          plan?: string | null
          signed_at?: string | null
          signed_by?: string | null
          status?: Database["public"]["Enums"]["note_status"]
          subjective?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["note_type"]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "encounter_notes_ai_request_fkey"
            columns: ["ai_request_id"]
            isOneToOne: false
            referencedRelation: "ai_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_notes_amended_from_fkey"
            columns: ["amended_from"]
            isOneToOne: false
            referencedRelation: "encounter_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_notes_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_notes_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      encounters: {
        Row: {
          chief_complaint: string | null
          class: Database["public"]["Enums"]["encounter_class"]
          created_at: string
          deleted_at: string | null
          end_at: string | null
          id: string
          location: string | null
          metadata: Json
          patient_id: string
          provider_id: string
          reason: string | null
          start_at: string
          status: Database["public"]["Enums"]["encounter_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          chief_complaint?: string | null
          class?: Database["public"]["Enums"]["encounter_class"]
          created_at?: string
          deleted_at?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          metadata?: Json
          patient_id: string
          provider_id: string
          reason?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["encounter_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          chief_complaint?: string | null
          class?: Database["public"]["Enums"]["encounter_class"]
          created_at?: string
          deleted_at?: string | null
          end_at?: string | null
          id?: string
          location?: string | null
          metadata?: Json
          patient_id?: string
          provider_id?: string
          reason?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["encounter_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "encounters_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          created_at: string
          enabled: boolean
          feature: string
          id: string
          metadata: Json
          period: string | null
          quota: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature: string
          id?: string
          metadata?: Json
          period?: string | null
          quota?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature?: string
          id?: string
          metadata?: Json
          period?: string | null
          quota?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_overrides: {
        Row: {
          created_at: string
          enabled: boolean
          flag_id: string
          id: string
          reason: string | null
          tenant_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          enabled: boolean
          flag_id: string
          id?: string
          reason?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          flag_id?: string
          id?: string
          reason?: string | null
          tenant_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_overrides_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flag_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          default_enabled: boolean
          description: string | null
          id: string
          key: string
          rollout_percent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          id?: string
          key: string
          rollout_percent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          id?: string
          key?: string
          rollout_percent?: number
          updated_at?: string
        }
        Relationships: []
      }
      immunizations: {
        Row: {
          administered_by: string | null
          administered_on: string
          created_at: string
          cvx_code: string | null
          deleted_at: string | null
          display_name: string
          id: string
          lot_number: string | null
          notes: string | null
          patient_id: string
          route: string | null
          site: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          administered_by?: string | null
          administered_on: string
          created_at?: string
          cvx_code?: string | null
          deleted_at?: string | null
          display_name: string
          id?: string
          lot_number?: string | null
          notes?: string | null
          patient_id: string
          route?: string | null
          site?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          administered_by?: string | null
          administered_on?: string
          created_at?: string
          cvx_code?: string | null
          deleted_at?: string | null
          display_name?: string
          id?: string
          lot_number?: string | null
          notes?: string | null
          patient_id?: string
          route?: string | null
          site?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "immunizations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "immunizations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          approved_by: string | null
          expires_at: string
          id: string
          impersonator_id: string
          ip: unknown
          reason: string
          revoked_at: string | null
          revoked_reason: string | null
          started_at: string
          target_user_id: string
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          approved_by?: string | null
          expires_at: string
          id?: string
          impersonator_id: string
          ip?: unknown
          reason: string
          revoked_at?: string | null
          revoked_reason?: string | null
          started_at?: string
          target_user_id: string
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          approved_by?: string | null
          expires_at?: string
          id?: string
          impersonator_id?: string
          ip?: unknown
          reason?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          started_at?: string
          target_user_id?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          display_name: string
          external_id: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          secret_ref: string | null
          status: Database["public"]["Enums"]["integration_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["integration_type"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          display_name: string
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          secret_ref?: string | null
          status?: Database["public"]["Enums"]["integration_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["integration_type"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          display_name?: string
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          secret_ref?: string | null
          status?: Database["public"]["Enums"]["integration_status"]
          tenant_id?: string
          type?: Database["public"]["Enums"]["integration_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          cost_minor: number | null
          created_at: string
          currency: string
          deleted_at: string | null
          expiration_date: string | null
          id: string
          location_id: string | null
          lot_number: string | null
          metadata: Json
          name: string
          ndc_code: string | null
          on_hand: number
          price_minor: number | null
          reorder_point: number | null
          sku: string | null
          tenant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          cost_minor?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          expiration_date?: string | null
          id?: string
          location_id?: string | null
          lot_number?: string | null
          metadata?: Json
          name: string
          ndc_code?: string | null
          on_hand?: number
          price_minor?: number | null
          reorder_point?: number | null
          sku?: string | null
          tenant_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          cost_minor?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          expiration_date?: string | null
          id?: string
          location_id?: string | null
          lot_number?: string | null
          metadata?: Json
          name?: string
          ndc_code?: string | null
          on_hand?: number
          price_minor?: number | null
          reorder_point?: number | null
          sku?: string | null
          tenant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string
          id: string
          item_id: string
          notes: string | null
          occurred_at: string
          performed_by: string | null
          quantity: number
          reference: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["inventory_txn_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          occurred_at?: string
          performed_by?: string | null
          quantity: number
          reference?: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["inventory_txn_type"]
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          occurred_at?: string
          performed_by?: string | null
          quantity?: number
          reference?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["inventory_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          roles: Database["public"]["Enums"]["staff_role"][]
          status: Database["public"]["Enums"]["invitation_status"]
          tenant_id: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          roles?: Database["public"]["Enums"]["staff_role"][]
          status?: Database["public"]["Enums"]["invitation_status"]
          tenant_id: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          roles?: Database["public"]["Enums"]["staff_role"][]
          status?: Database["public"]["Enums"]["invitation_status"]
          tenant_id?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount_minor: number
          charge_id: string | null
          created_at: string
          currency: string
          description: string
          id: string
          invoice_id: string
          line_order: number
          quantity: number
          tenant_id: string
          unit_price_minor: number
        }
        Insert: {
          amount_minor?: number
          charge_id?: string | null
          created_at?: string
          currency?: string
          description: string
          id?: string
          invoice_id: string
          line_order?: number
          quantity?: number
          tenant_id: string
          unit_price_minor: number
        }
        Update: {
          amount_minor?: number
          charge_id?: string | null
          created_at?: string
          currency?: string
          description?: string
          id?: string
          invoice_id?: string
          line_order?: number
          quantity?: number
          tenant_id?: string
          unit_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          balance_minor: number
          created_at: string
          currency: string
          due_at: string | null
          id: string
          issued_at: string | null
          metadata: Json
          notes: string | null
          number: string
          patient_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor: number
          tax_minor: number
          tenant_id: string
          total_minor: number
          updated_at: string
        }
        Insert: {
          balance_minor?: number
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          issued_at?: string | null
          metadata?: Json
          notes?: string | null
          number?: string
          patient_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor?: number
          tax_minor?: number
          tenant_id: string
          total_minor?: number
          updated_at?: string
        }
        Update: {
          balance_minor?: number
          created_at?: string
          currency?: string
          due_at?: string | null
          id?: string
          issued_at?: string | null
          metadata?: Json
          notes?: string | null
          number?: string
          patient_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal_minor?: number
          tax_minor?: number
          tenant_id?: string
          total_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: Json | null
          code: string | null
          created_at: string
          id: string
          name: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: Json | null
          code?: string | null
          created_at?: string
          id?: string
          name: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: Json | null
          code?: string | null
          created_at?: string
          id?: string
          name?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string
          dose: string | null
          end_date: string | null
          frequency: string | null
          id: string
          notes: string | null
          patient_id: string
          prescribing_provider_id: string | null
          route: string | null
          rxnorm_code: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["medication_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name: string
          dose?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          prescribing_provider_id?: string | null
          route?: string | null
          rxnorm_code?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["medication_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          dose?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          prescribing_provider_id?: string | null
          route?: string | null
          rxnorm_code?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["medication_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          channel: Database["public"]["Enums"]["notification_channel"]
          enabled: boolean
          id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          channel: Database["public"]["Enums"]["notification_channel"]
          enabled?: boolean
          id?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          enabled?: boolean
          id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          attempts: number
          body_html: string | null
          body_text: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          delivered_at: string | null
          failed_at: string | null
          id: string
          last_error: string | null
          provider: string | null
          provider_ref: string | null
          recipient_email: string | null
          recipient_id: string | null
          recipient_phone: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          subject: string | null
          template_data: Json
          template_key: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          body_html?: string | null
          body_text?: string | null
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivered_at?: string | null
          failed_at?: string | null
          id?: string
          last_error?: string | null
          provider?: string | null
          provider_ref?: string | null
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          subject?: string | null
          template_data?: Json
          template_key?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          body_html?: string | null
          body_text?: string | null
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          delivered_at?: string | null
          failed_at?: string | null
          id?: string
          last_error?: string | null
          provider?: string | null
          provider_ref?: string | null
          recipient_email?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          subject?: string | null
          template_data?: Json
          template_key?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_results: {
        Row: {
          abnormal_flag: string | null
          attachments: string[] | null
          code: string | null
          code_system: string | null
          created_at: string
          display_name: string
          id: string
          interpretation: string | null
          observed_at: string
          order_id: string
          reference_high: number | null
          reference_low: number | null
          reported_at: string | null
          reported_by: string | null
          status: Database["public"]["Enums"]["order_result_status"]
          tenant_id: string
          unit: string | null
          updated_at: string
          value_json: Json | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          abnormal_flag?: string | null
          attachments?: string[] | null
          code?: string | null
          code_system?: string | null
          created_at?: string
          display_name: string
          id?: string
          interpretation?: string | null
          observed_at?: string
          order_id: string
          reference_high?: number | null
          reference_low?: number | null
          reported_at?: string | null
          reported_by?: string | null
          status?: Database["public"]["Enums"]["order_result_status"]
          tenant_id: string
          unit?: string | null
          updated_at?: string
          value_json?: Json | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          abnormal_flag?: string | null
          attachments?: string[] | null
          code?: string | null
          code_system?: string | null
          created_at?: string
          display_name?: string
          id?: string
          interpretation?: string | null
          observed_at?: string
          order_id?: string
          reference_high?: number | null
          reference_low?: number | null
          reported_at?: string | null
          reported_by?: string | null
          status?: Database["public"]["Enums"]["order_result_status"]
          tenant_id?: string
          unit?: string | null
          updated_at?: string
          value_json?: Json | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_results_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          code: string | null
          code_system: string | null
          created_at: string
          display_name: string
          encounter_id: string | null
          id: string
          instructions: string | null
          metadata: Json
          ordering_provider_id: string
          patient_id: string
          priority: Database["public"]["Enums"]["order_priority"]
          reason: string | null
          scheduled_for: string | null
          status: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["order_type"]
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          code?: string | null
          code_system?: string | null
          created_at?: string
          display_name: string
          encounter_id?: string | null
          id?: string
          instructions?: string | null
          metadata?: Json
          ordering_provider_id: string
          patient_id: string
          priority?: Database["public"]["Enums"]["order_priority"]
          reason?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tenant_id: string
          type: Database["public"]["Enums"]["order_type"]
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          code?: string | null
          code_system?: string | null
          created_at?: string
          display_name?: string
          encounter_id?: string | null
          id?: string
          instructions?: string | null
          metadata?: Json
          ordering_provider_id?: string
          patient_id?: string
          priority?: Database["public"]["Enums"]["order_priority"]
          reason?: string | null
          scheduled_for?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          tenant_id?: string
          type?: Database["public"]["Enums"]["order_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_contacts: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_primary: boolean
          patient_id: string
          tenant_id: string
          type: Database["public"]["Enums"]["contact_type"]
          updated_at: string
          value: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_primary?: boolean
          patient_id: string
          tenant_id: string
          type: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          value: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_primary?: boolean
          patient_id?: string
          tenant_id?: string
          type?: Database["public"]["Enums"]["contact_type"]
          updated_at?: string
          value?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_contacts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_coverages: {
        Row: {
          active: boolean
          copay_minor: number | null
          created_at: string
          currency: string
          deductible_minor: number | null
          effective_end: string | null
          effective_start: string | null
          group_number: string | null
          id: string
          member_id: string
          metadata: Json
          patient_id: string
          payer_id: string
          plan_name: string | null
          relationship: string | null
          subscriber_name: string | null
          tenant_id: string
          type: Database["public"]["Enums"]["coverage_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          copay_minor?: number | null
          created_at?: string
          currency?: string
          deductible_minor?: number | null
          effective_end?: string | null
          effective_start?: string | null
          group_number?: string | null
          id?: string
          member_id: string
          metadata?: Json
          patient_id: string
          payer_id: string
          plan_name?: string | null
          relationship?: string | null
          subscriber_name?: string | null
          tenant_id: string
          type?: Database["public"]["Enums"]["coverage_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          copay_minor?: number | null
          created_at?: string
          currency?: string
          deductible_minor?: number | null
          effective_end?: string | null
          effective_start?: string | null
          group_number?: string | null
          id?: string
          member_id?: string
          metadata?: Json
          patient_id?: string
          payer_id?: string
          plan_name?: string | null
          relationship?: string | null
          subscriber_name?: string | null
          tenant_id?: string
          type?: Database["public"]["Enums"]["coverage_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_coverages_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_coverages_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "payers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_coverages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_portal_links: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          patient_id: string
          tenant_id: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          patient_id: string
          tenant_id: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          patient_id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_portal_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_portal_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          created_at: string
          date_of_birth: string
          deceased_at: string | null
          deleted_at: string | null
          family_name: string
          gender_identity: string | null
          given_name: string
          id: string
          metadata: Json
          mrn: string
          preferred_language: string | null
          preferred_name: string | null
          pronouns: string | null
          sex_at_birth: Database["public"]["Enums"]["sex_at_birth"]
          ssn_hash: string | null
          ssn_last4: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth: string
          deceased_at?: string | null
          deleted_at?: string | null
          family_name: string
          gender_identity?: string | null
          given_name: string
          id?: string
          metadata?: Json
          mrn: string
          preferred_language?: string | null
          preferred_name?: string | null
          pronouns?: string | null
          sex_at_birth: Database["public"]["Enums"]["sex_at_birth"]
          ssn_hash?: string | null
          ssn_last4?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string
          deceased_at?: string | null
          deleted_at?: string | null
          family_name?: string
          gender_identity?: string | null
          given_name?: string
          id?: string
          metadata?: Json
          mrn?: string
          preferred_language?: string | null
          preferred_name?: string | null
          pronouns?: string | null
          sex_at_birth?: Database["public"]["Enums"]["sex_at_birth"]
          ssn_hash?: string | null
          ssn_last4?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payers: {
        Row: {
          active: boolean
          claims_address: Json | null
          created_at: string
          edi_sender_id: string | null
          fax: string | null
          id: string
          metadata: Json
          name: string
          payer_code: string | null
          phone: string | null
          tenant_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          active?: boolean
          claims_address?: Json | null
          created_at?: string
          edi_sender_id?: string | null
          fax?: string | null
          id?: string
          metadata?: Json
          name: string
          payer_code?: string | null
          phone?: string | null
          tenant_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          active?: boolean
          claims_address?: Json | null
          created_at?: string
          edi_sender_id?: string | null
          fax?: string | null
          id?: string
          metadata?: Json
          name?: string
          payer_code?: string | null
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          id: string
          invoice_id: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes: string | null
          patient_id: string | null
          payer_id: string | null
          processor: string | null
          processor_ref: string | null
          received_at: string
          reference: string | null
          tenant_id: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          method: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          patient_id?: string | null
          payer_id?: string | null
          processor?: string | null
          processor_ref?: string | null
          received_at?: string
          reference?: string | null
          tenant_id: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          method?: Database["public"]["Enums"]["payment_method"]
          notes?: string | null
          patient_id?: string | null
          payer_id?: string | null
          processor?: string | null
          processor_ref?: string | null
          received_at?: string
          reference?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "payers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          notes: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["platform_role"]
          updated_at: string
          user_id: string
          webauthn_required: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          notes?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
          user_id: string
          webauthn_required?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          notes?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          updated_at?: string
          user_id?: string
          webauthn_required?: boolean
        }
        Relationships: []
      }
      prescriptions: {
        Row: {
          created_at: string
          days_supply: number | null
          display_name: string
          dose: string
          expires_at: string | null
          filled_at: string | null
          frequency: string | null
          id: string
          medication_id: string | null
          notes: string | null
          order_id: string | null
          patient_id: string
          pharmacy_name: string | null
          pharmacy_ncpdp: string | null
          prescribing_provider_id: string
          quantity: number | null
          quantity_unit: string | null
          refills: number
          refills_remaining: number
          route: string | null
          rxnorm_code: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["prescription_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_supply?: number | null
          display_name: string
          dose: string
          expires_at?: string | null
          filled_at?: string | null
          frequency?: string | null
          id?: string
          medication_id?: string | null
          notes?: string | null
          order_id?: string | null
          patient_id: string
          pharmacy_name?: string | null
          pharmacy_ncpdp?: string | null
          prescribing_provider_id: string
          quantity?: number | null
          quantity_unit?: string | null
          refills?: number
          refills_remaining?: number
          route?: string | null
          rxnorm_code?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["prescription_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_supply?: number | null
          display_name?: string
          dose?: string
          expires_at?: string | null
          filled_at?: string | null
          frequency?: string | null
          id?: string
          medication_id?: string | null
          notes?: string | null
          order_id?: string | null
          patient_id?: string
          pharmacy_name?: string | null
          pharmacy_ncpdp?: string | null
          prescribing_provider_id?: string
          quantity?: number | null
          quantity_unit?: string | null
          refills?: number
          refills_remaining?: number
          route?: string | null
          rxnorm_code?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["prescription_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prescriptions_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      problems: {
        Row: {
          code: string
          code_system: string
          created_at: string
          deleted_at: string | null
          description: string
          id: string
          onset_date: string | null
          patient_id: string
          recorded_by: string | null
          resolved_date: string | null
          status: Database["public"]["Enums"]["problem_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code: string
          code_system?: string
          created_at?: string
          deleted_at?: string | null
          description: string
          id?: string
          onset_date?: string | null
          patient_id: string
          recorded_by?: string | null
          resolved_date?: string | null
          status?: Database["public"]["Enums"]["problem_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          code_system?: string
          created_at?: string
          deleted_at?: string | null
          description?: string
          id?: string
          onset_date?: string | null
          patient_id?: string
          recorded_by?: string | null
          resolved_date?: string | null
          status?: Database["public"]["Enums"]["problem_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "problems_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problems_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          locale: string
          metadata: Json
          phone: string | null
          timezone: string
          updated_at: string
          user_kind: Database["public"]["Enums"]["user_kind"]
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          locale?: string
          metadata?: Json
          phone?: string | null
          timezone?: string
          updated_at?: string
          user_kind?: Database["public"]["Enums"]["user_kind"]
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          locale?: string
          metadata?: Json
          phone?: string | null
          timezone?: string
          updated_at?: string
          user_kind?: Database["public"]["Enums"]["user_kind"]
        }
        Relationships: []
      }
      signatures: {
        Row: {
          attestation: string | null
          created_at: string
          hash: string
          id: string
          ip: unknown
          signed_at: string
          signer_id: string
          subject_id: string
          subject_schema: string
          subject_table: string
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          attestation?: string | null
          created_at?: string
          hash: string
          id?: string
          ip?: unknown
          signed_at?: string
          signer_id: string
          subject_id: string
          subject_schema: string
          subject_table: string
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          attestation?: string | null
          created_at?: string
          hash?: string
          id?: string
          ip?: unknown
          signed_at?: string
          signer_id?: string
          subject_id?: string
          subject_schema?: string
          subject_table?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signatures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_schedules: {
        Row: {
          capacity: number
          created_at: string
          end_at: string
          id: string
          location_id: string | null
          notes: string | null
          provider_id: string
          slot_minutes: number
          start_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          end_at: string
          id?: string
          location_id?: string | null
          notes?: string | null
          provider_id: string
          slot_minutes?: number
          start_at: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          end_at?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          provider_id?: string
          slot_minutes?: number
          start_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_schedules_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at: string | null
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          plan: Database["public"]["Enums"]["tenant_plan"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          trial_end: string | null
          updated_at: string
        }
        Insert: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan: Database["public"]["Enums"]["tenant_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          trial_end?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at?: string | null
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          plan?: Database["public"]["Enums"]["tenant_plan"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          trial_end?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          task_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          task_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          task_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_at: string | null
          assignee_id: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          metadata: Json
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          started_at: string | null
          status: Database["public"]["Enums"]["task_status"]
          subject_id: string | null
          subject_schema: string | null
          subject_table: string | null
          tags: string[]
          tenant_id: string
          title: string
          updated_at: string
          workflow_run_id: string | null
        }
        Insert: {
          assigned_at?: string | null
          assignee_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          subject_id?: string | null
          subject_schema?: string | null
          subject_table?: string | null
          tags?: string[]
          tenant_id: string
          title: string
          updated_at?: string
          workflow_run_id?: string | null
        }
        Update: {
          assigned_at?: string | null
          assignee_id?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          subject_id?: string | null
          subject_schema?: string | null
          subject_table?: string | null
          tags?: string[]
          tenant_id?: string
          title?: string
          updated_at?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workflow_run_id_fkey"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_members: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          invited_by: string | null
          joined_at: string
          roles: Database["public"]["Enums"]["staff_role"][]
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          roles?: Database["public"]["Enums"]["staff_role"][]
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          roles?: Database["public"]["Enums"]["staff_role"][]
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string
          hipaa_baa_signed: boolean
          hipaa_baa_signed_at: string | null
          id: string
          metadata: Json
          plan: Database["public"]["Enums"]["tenant_plan"]
          region: Database["public"]["Enums"]["tenant_region"]
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name: string
          hipaa_baa_signed?: boolean
          hipaa_baa_signed_at?: string | null
          id?: string
          metadata?: Json
          plan?: Database["public"]["Enums"]["tenant_plan"]
          region?: Database["public"]["Enums"]["tenant_region"]
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          hipaa_baa_signed?: boolean
          hipaa_baa_signed_at?: string | null
          id?: string
          metadata?: Json
          plan?: Database["public"]["Enums"]["tenant_plan"]
          region?: Database["public"]["Enums"]["tenant_region"]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          meter: Database["public"]["Enums"]["usage_meter_key"]
          occurred_at: string
          quantity: number
          reference: string | null
          reported_to_processor_at: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          meter: Database["public"]["Enums"]["usage_meter_key"]
          occurred_at?: string
          quantity: number
          reference?: string | null
          reported_to_processor_at?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          meter?: Database["public"]["Enums"]["usage_meter_key"]
          occurred_at?: string
          quantity?: number
          reference?: string | null
          reported_to_processor_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vitals: {
        Row: {
          bmi: number | null
          created_at: string
          diastolic_mmhg: number | null
          encounter_id: string | null
          heart_rate_bpm: number | null
          height_cm: number | null
          id: string
          notes: string | null
          pain_score: number | null
          patient_id: string
          recorded_at: string
          recorded_by: string | null
          respiratory_rate: number | null
          spo2_pct: number | null
          systolic_mmhg: number | null
          temperature_c: number | null
          tenant_id: string
          weight_kg: number | null
        }
        Insert: {
          bmi?: number | null
          created_at?: string
          diastolic_mmhg?: number | null
          encounter_id?: string | null
          heart_rate_bpm?: number | null
          height_cm?: number | null
          id?: string
          notes?: string | null
          pain_score?: number | null
          patient_id: string
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          spo2_pct?: number | null
          systolic_mmhg?: number | null
          temperature_c?: number | null
          tenant_id: string
          weight_kg?: number | null
        }
        Update: {
          bmi?: number | null
          created_at?: string
          diastolic_mmhg?: number | null
          encounter_id?: string | null
          heart_rate_bpm?: number | null
          height_cm?: number | null
          id?: string
          notes?: string | null
          pain_score?: number | null
          patient_id?: string
          recorded_at?: string
          recorded_by?: string | null
          respiratory_rate?: number | null
          spo2_pct?: number | null
          systolic_mmhg?: number | null
          temperature_c?: number | null
          tenant_id?: string
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vitals_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          connection_id: string | null
          direction: string
          error_message: string | null
          event_type: string
          external_id: string | null
          http_status: number | null
          id: string
          processed_at: string | null
          provider: string
          received_at: string
          request_body: Json | null
          response_body: Json | null
          signature: string | null
          tenant_id: string | null
          verified: boolean
        }
        Insert: {
          connection_id?: string | null
          direction: string
          error_message?: string | null
          event_type: string
          external_id?: string | null
          http_status?: number | null
          id?: string
          processed_at?: string | null
          provider: string
          received_at?: string
          request_body?: Json | null
          response_body?: Json | null
          signature?: string | null
          tenant_id?: string | null
          verified?: boolean
        }
        Update: {
          connection_id?: string | null
          direction?: string
          error_message?: string | null
          event_type?: string
          external_id?: string | null
          http_status?: number | null
          id?: string
          processed_at?: string | null
          provider?: string
          received_at?: string
          request_body?: Json | null
          response_body?: Json | null
          signature?: string | null
          tenant_id?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          definition: Json
          description: string | null
          display_name: string
          id: string
          is_active: boolean
          key: string
          tenant_id: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition: Json
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          key: string
          tenant_id?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          key?: string
          tenant_id?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflow_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          context: Json
          correlation_id: string | null
          created_at: string
          current_state: string | null
          definition_id: string
          id: string
          last_error: string | null
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["workflow_run_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          current_state?: string | null
          definition_id: string
          id?: string
          last_error?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          context?: Json
          correlation_id?: string | null
          created_at?: string
          current_state?: string | null
          definition_id?: string
          id?: string
          last_error?: string | null
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["workflow_run_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "workflow_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      usage_monthly: {
        Row: {
          event_count: number | null
          meter: Database["public"]["Enums"]["usage_meter_key"] | null
          period_start: string | null
          tenant_id: string | null
          total_quantity: number | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_impersonation: {
        Args: never
        Returns: {
          expires_at: string
          impersonator_id: string
          session_id: string
          target_user_id: string
          tenant_id: string
        }[]
      }
      current_user_patient_ids: {
        Args: { p_tenant_id?: string }
        Returns: string[]
      }
      current_user_roles: { Args: { p_tenant_id: string }; Returns: string[] }
      current_user_tenant_ids: { Args: never; Returns: string[] }
      has_permission: {
        Args: { p_permission: string; p_tenant_id?: string }
        Returns: boolean
      }
      impersonate_end: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: undefined
      }
      impersonate_start: {
        Args: {
          p_approved_by?: string
          p_duration_minutes?: number
          p_reason: string
          p_target_user_id: string
          p_tenant_id: string
        }
        Returns: {
          expires_at: string
          impersonator_id: string
          session_id: string
          started_at: string
          target_user_id: string
          tenant_id: string
        }[]
      }
      is_platform_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      ai_provider: "anthropic" | "openai"
      ai_request_status:
        | "pending"
        | "streaming"
        | "completed"
        | "failed"
        | "blocked"
      ai_safety_verdict: "pass" | "warn" | "block"
      allergy_severity: "mild" | "moderate" | "severe" | "life_threatening"
      allergy_type: "medication" | "food" | "environmental" | "other"
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "arrived"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "no_show"
        | "rescheduled"
      claim_status:
        | "draft"
        | "ready"
        | "submitted"
        | "accepted"
        | "rejected"
        | "paid"
        | "partial"
        | "denied"
        | "appealed"
        | "closed"
      contact_type:
        | "phone_home"
        | "phone_mobile"
        | "phone_work"
        | "email"
        | "address"
      coverage_type:
        | "primary"
        | "secondary"
        | "tertiary"
        | "self_pay"
        | "workers_comp"
        | "auto"
        | "other"
      encounter_class:
        | "ambulatory"
        | "emergency"
        | "inpatient"
        | "telehealth"
        | "home"
        | "virtual"
        | "observation"
      encounter_status:
        | "planned"
        | "arrived"
        | "in_progress"
        | "finished"
        | "cancelled"
      integration_status: "active" | "disabled" | "error" | "expired"
      integration_type:
        | "fhir"
        | "hl7"
        | "stripe"
        | "twilio"
        | "resend"
        | "posthog"
        | "sentry"
        | "generic_webhook"
        | "oauth_smart"
      inventory_txn_type:
        | "receipt"
        | "dispense"
        | "waste"
        | "transfer"
        | "adjustment"
        | "return"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      invoice_status:
        | "draft"
        | "issued"
        | "paid"
        | "partial"
        | "void"
        | "written_off"
        | "refunded"
      medication_status:
        | "active"
        | "on_hold"
        | "completed"
        | "stopped"
        | "draft"
      note_status: "draft" | "pending_review" | "signed" | "amended"
      note_type:
        | "soap"
        | "progress"
        | "discharge"
        | "consult"
        | "operative"
        | "procedure"
        | "nursing"
        | "ai_draft"
      notification_channel: "email" | "sms" | "push" | "in_app"
      notification_status:
        | "queued"
        | "sending"
        | "sent"
        | "delivered"
        | "bounced"
        | "failed"
        | "suppressed"
      order_priority: "routine" | "urgent" | "stat" | "asap"
      order_result_status:
        | "preliminary"
        | "final"
        | "amended"
        | "cancelled"
        | "corrected"
      order_status:
        | "draft"
        | "ordered"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "amended"
      order_type:
        | "lab"
        | "imaging"
        | "medication"
        | "referral"
        | "procedure"
        | "nursing"
      payment_method:
        | "cash"
        | "check"
        | "card"
        | "ach"
        | "insurance"
        | "credit_adjust"
        | "write_off"
        | "other"
      platform_role: "super_admin"
      prescription_status: "draft" | "sent" | "filled" | "cancelled" | "expired"
      problem_status: "active" | "inactive" | "resolved"
      role:
        | "owner"
        | "admin"
        | "clinician"
        | "nurse"
        | "billing"
        | "scheduler"
        | "patient"
        | "read_only"
      sex_at_birth: "male" | "female" | "intersex" | "unknown"
      staff_role:
        | "practice_owner"
        | "office_admin"
        | "physician"
        | "nurse_ma"
        | "scheduler"
        | "biller"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
        | "paused"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status:
        | "pending"
        | "assigned"
        | "in_progress"
        | "blocked"
        | "completed"
        | "cancelled"
      tenant_plan: "starter" | "growth" | "enterprise"
      tenant_region: "us-east-1" | "us-west-2" | "eu-west-1" | "ap-south-1"
      usage_meter_key:
        | "ai_completions"
        | "encounters"
        | "seats"
        | "storage_gb"
        | "api_calls"
        | "claims_submitted"
        | "notifications_sent"
      user_kind: "staff" | "patient" | "platform" | "service"
      workflow_run_status:
        | "pending"
        | "running"
        | "paused"
        | "completed"
        | "failed"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      ai_provider: ["anthropic", "openai"],
      ai_request_status: [
        "pending",
        "streaming",
        "completed",
        "failed",
        "blocked",
      ],
      ai_safety_verdict: ["pass", "warn", "block"],
      allergy_severity: ["mild", "moderate", "severe", "life_threatening"],
      allergy_type: ["medication", "food", "environmental", "other"],
      appointment_status: [
        "scheduled",
        "confirmed",
        "arrived",
        "in_progress",
        "completed",
        "cancelled",
        "no_show",
        "rescheduled",
      ],
      claim_status: [
        "draft",
        "ready",
        "submitted",
        "accepted",
        "rejected",
        "paid",
        "partial",
        "denied",
        "appealed",
        "closed",
      ],
      contact_type: [
        "phone_home",
        "phone_mobile",
        "phone_work",
        "email",
        "address",
      ],
      coverage_type: [
        "primary",
        "secondary",
        "tertiary",
        "self_pay",
        "workers_comp",
        "auto",
        "other",
      ],
      encounter_class: [
        "ambulatory",
        "emergency",
        "inpatient",
        "telehealth",
        "home",
        "virtual",
        "observation",
      ],
      encounter_status: [
        "planned",
        "arrived",
        "in_progress",
        "finished",
        "cancelled",
      ],
      integration_status: ["active", "disabled", "error", "expired"],
      integration_type: [
        "fhir",
        "hl7",
        "stripe",
        "twilio",
        "resend",
        "posthog",
        "sentry",
        "generic_webhook",
        "oauth_smart",
      ],
      inventory_txn_type: [
        "receipt",
        "dispense",
        "waste",
        "transfer",
        "adjustment",
        "return",
      ],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      invoice_status: [
        "draft",
        "issued",
        "paid",
        "partial",
        "void",
        "written_off",
        "refunded",
      ],
      medication_status: ["active", "on_hold", "completed", "stopped", "draft"],
      note_status: ["draft", "pending_review", "signed", "amended"],
      note_type: [
        "soap",
        "progress",
        "discharge",
        "consult",
        "operative",
        "procedure",
        "nursing",
        "ai_draft",
      ],
      notification_channel: ["email", "sms", "push", "in_app"],
      notification_status: [
        "queued",
        "sending",
        "sent",
        "delivered",
        "bounced",
        "failed",
        "suppressed",
      ],
      order_priority: ["routine", "urgent", "stat", "asap"],
      order_result_status: [
        "preliminary",
        "final",
        "amended",
        "cancelled",
        "corrected",
      ],
      order_status: [
        "draft",
        "ordered",
        "in_progress",
        "completed",
        "cancelled",
        "amended",
      ],
      order_type: [
        "lab",
        "imaging",
        "medication",
        "referral",
        "procedure",
        "nursing",
      ],
      payment_method: [
        "cash",
        "check",
        "card",
        "ach",
        "insurance",
        "credit_adjust",
        "write_off",
        "other",
      ],
      platform_role: ["super_admin"],
      prescription_status: ["draft", "sent", "filled", "cancelled", "expired"],
      problem_status: ["active", "inactive", "resolved"],
      role: [
        "owner",
        "admin",
        "clinician",
        "nurse",
        "billing",
        "scheduler",
        "patient",
        "read_only",
      ],
      sex_at_birth: ["male", "female", "intersex", "unknown"],
      staff_role: [
        "practice_owner",
        "office_admin",
        "physician",
        "nurse_ma",
        "scheduler",
        "biller",
      ],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "unpaid",
        "paused",
      ],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: [
        "pending",
        "assigned",
        "in_progress",
        "blocked",
        "completed",
        "cancelled",
      ],
      tenant_plan: ["starter", "growth", "enterprise"],
      tenant_region: ["us-east-1", "us-west-2", "eu-west-1", "ap-south-1"],
      usage_meter_key: [
        "ai_completions",
        "encounters",
        "seats",
        "storage_gb",
        "api_calls",
        "claims_submitted",
        "notifications_sent",
      ],
      user_kind: ["staff", "patient", "platform", "service"],
      workflow_run_status: [
        "pending",
        "running",
        "paused",
        "completed",
        "failed",
        "cancelled",
      ],
    },
  },
} as const
