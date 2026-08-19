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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_messages: {
        Row: {
          created_at: string
          id: string
          is_from_admin: boolean
          message: string
          read_at: string | null
          sender_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_from_admin?: boolean
          message: string
          read_at?: string | null
          sender_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_from_admin?: boolean
          message?: string
          read_at?: string | null
          sender_id?: string
          user_id?: string
        }
        Relationships: []
      }
      debourne_users: {
        Row: {
          access_level: string
          added_at: string
          added_by: string | null
          created_at: string
          display_access: boolean | null
          email: string
          id: string
          is_active: boolean | null
          last_access: string | null
          metadata: Json | null
          name: string
          portfolio_access: boolean | null
          updated_at: string
        }
        Insert: {
          access_level?: string
          added_at?: string
          added_by?: string | null
          created_at?: string
          display_access?: boolean | null
          email: string
          id?: string
          is_active?: boolean | null
          last_access?: string | null
          metadata?: Json | null
          name: string
          portfolio_access?: boolean | null
          updated_at?: string
        }
        Update: {
          access_level?: string
          added_at?: string
          added_by?: string | null
          created_at?: string
          display_access?: boolean | null
          email?: string
          id?: string
          is_active?: boolean | null
          last_access?: string | null
          metadata?: Json | null
          name?: string
          portfolio_access?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      global_products: {
        Row: {
          aliexpress_id: string | null
          aliexpress_url: string | null
          category: string | null
          cost_price: number
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          images: string[] | null
          is_available: boolean | null
          name: string
          shipping_time_max: number | null
          shipping_time_min: number | null
          stock: number | null
          suggested_price: number
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          aliexpress_id?: string | null
          aliexpress_url?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_available?: boolean | null
          name: string
          shipping_time_max?: number | null
          shipping_time_min?: number | null
          stock?: number | null
          suggested_price?: number
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          aliexpress_id?: string | null
          aliexpress_url?: string | null
          category?: string | null
          cost_price?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          is_available?: boolean | null
          name?: string
          shipping_time_max?: number | null
          shipping_time_min?: number | null
          stock?: number | null
          suggested_price?: number
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          order_id: string | null
          paid_at: string | null
          payment_method: string | null
          status: string
          subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          id?: string
          order_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          order_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      menuden_products: {
        Row: {
          categoria: string | null
          created_at: string
          descricao: string | null
          disponivel: boolean | null
          id: string
          imagem: string | null
          nome_prato: string
          preco: number
          store_id: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          disponivel?: boolean | null
          id?: string
          imagem?: string | null
          nome_prato: string
          preco?: number
          store_id?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          disponivel?: boolean | null
          id?: string
          imagem?: string | null
          nome_prato?: string
          preco?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menuden_products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "menuden_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      menuden_stores: {
        Row: {
          cnpj: string | null
          created_at: string
          email: string | null
          endereco: string | null
          id: string
          logo: string | null
          nome_loja: string | null
          telefone: string | null
          template_id: string | null
          tipo_negocio: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          logo?: string | null
          nome_loja?: string | null
          telefone?: string | null
          template_id?: string | null
          tipo_negocio?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          endereco?: string | null
          id?: string
          logo?: string | null
          nome_loja?: string | null
          telefone?: string | null
          template_id?: string | null
          tipo_negocio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menuden_stores_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      navigation_items: {
        Row: {
          allowed_roles: Json | null
          created_at: string
          feature: string | null
          icon_name: string | null
          id: string
          is_active: boolean
          is_editable: boolean
          label: string
          order_index: number
          path: string
          required_features: Json | null
          required_plans: Json | null
          section: string
          updated_at: string
        }
        Insert: {
          allowed_roles?: Json | null
          created_at?: string
          feature?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_editable?: boolean
          label: string
          order_index?: number
          path: string
          required_features?: Json | null
          required_plans?: Json | null
          section?: string
          updated_at?: string
        }
        Update: {
          allowed_roles?: Json | null
          created_at?: string
          feature?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean
          is_editable?: boolean
          label?: string
          order_index?: number
          path?: string
          required_features?: Json | null
          required_plans?: Json | null
          section?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          plan_id: string | null
          product_id: string | null
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          plan_id?: string | null
          product_id?: string | null
          quantity?: number
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          plan_id?: string | null
          product_id?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          status: string
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          status?: string
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          allowed_features: Json | null
          allowed_pages: Json | null
          created_at: string
          description: string | null
          features: Json | null
          id: string
          interval: string
          is_active: boolean
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          allowed_features?: Json | null
          allowed_pages?: Json | null
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          interval?: string
          is_active?: boolean
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          allowed_features?: Json | null
          allowed_pages?: Json | null
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          interval?: string
          is_active?: boolean
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          store_id: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          store_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          store_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "public_store_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_settings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_expenses_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          featured: boolean | null
          free_shipping: boolean | null
          id: string
          image_url: string | null
          images: string[] | null
          is_active: boolean
          markup_percent: number | null
          menuden_id: string | null
          name: string
          price: number
          promotional_price: number | null
          rating: number | null
          reviews_count: number | null
          shipping_days: number | null
          sold_count: number | null
          stock: number | null
          store_id: string | null
          supplier_name: string | null
          supplier_price: number | null
          supplier_sku: string | null
          supplier_url: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean | null
          free_shipping?: boolean | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean
          markup_percent?: number | null
          menuden_id?: string | null
          name: string
          price?: number
          promotional_price?: number | null
          rating?: number | null
          reviews_count?: number | null
          shipping_days?: number | null
          sold_count?: number | null
          stock?: number | null
          store_id?: string | null
          supplier_name?: string | null
          supplier_price?: number | null
          supplier_sku?: string | null
          supplier_url?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean | null
          free_shipping?: boolean | null
          id?: string
          image_url?: string | null
          images?: string[] | null
          is_active?: boolean
          markup_percent?: number | null
          menuden_id?: string | null
          name?: string
          price?: number
          promotional_price?: number | null
          rating?: number | null
          reviews_count?: number | null
          shipping_days?: number | null
          sold_count?: number | null
          stock?: number | null
          store_id?: string | null
          supplier_name?: string | null
          supplier_price?: number | null
          supplier_sku?: string | null
          supplier_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          aliexpress_credentials: Json | null
          avatar_url: string | null
          company: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          shopify_credentials: Json | null
          updated_at: string
        }
        Insert: {
          aliexpress_credentials?: Json | null
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          shopify_credentials?: Json | null
          updated_at?: string
        }
        Update: {
          aliexpress_credentials?: Json | null
          avatar_url?: string | null
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          shopify_credentials?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      store_integrations: {
        Row: {
          access_token: string | null
          account_id: string | null
          account_name: string | null
          created_at: string
          id: string
          integration_type: string
          is_active: boolean | null
          last_sync_at: string | null
          metadata: Json | null
          refresh_token: string | null
          store_id: string
          sync_enabled: boolean | null
          token_expires_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string
          id?: string
          integration_type: string
          is_active?: boolean | null
          last_sync_at?: string | null
          metadata?: Json | null
          refresh_token?: string | null
          store_id: string
          sync_enabled?: boolean | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          account_id?: string | null
          account_name?: string | null
          created_at?: string
          id?: string
          integration_type?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          metadata?: Json | null
          refresh_token?: string | null
          store_id?: string
          sync_enabled?: boolean | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_integrations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "public_store_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_integrations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      store_payment_settings: {
        Row: {
          boleto_enabled: boolean | null
          card_enabled: boolean | null
          created_at: string
          id: string
          installments_enabled: boolean | null
          max_installments: number | null
          pix_enabled: boolean | null
          store_id: string
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean | null
          updated_at: string
        }
        Insert: {
          boleto_enabled?: boolean | null
          card_enabled?: boolean | null
          created_at?: string
          id?: string
          installments_enabled?: boolean | null
          max_installments?: number | null
          pix_enabled?: boolean | null
          store_id: string
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          updated_at?: string
        }
        Update: {
          boleto_enabled?: boolean | null
          card_enabled?: boolean | null
          created_at?: string
          id?: string
          installments_enabled?: boolean | null
          max_installments?: number | null
          pix_enabled?: boolean | null
          store_id?: string
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_payment_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "public_store_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_payment_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "store_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          address: string | null
          business_type: string | null
          cnpj: string | null
          created_at: string
          id: string
          logo_url: string | null
          migrated_at: string | null
          migrated_from: string | null
          phone: string | null
          settings: Json | null
          slug: string | null
          store_name: string | null
          template_id: string | null
          template_type: string | null
          theme: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          migrated_at?: string | null
          migrated_from?: string | null
          phone?: string | null
          settings?: Json | null
          slug?: string | null
          store_name?: string | null
          template_id?: string | null
          template_type?: string | null
          theme?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          business_type?: string | null
          cnpj?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          migrated_at?: string | null
          migrated_from?: string | null
          phone?: string | null
          settings?: Json | null
          slug?: string | null
          store_name?: string | null
          template_id?: string | null
          template_type?: string | null
          theme?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          plan_id: string
          started_at: string
          status: string
          trial_end_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id: string
          started_at?: string
          status?: string
          trial_end_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id?: string
          started_at?: string
          status?: string
          trial_end_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          error_message: string | null
          id: string
          products_imported: number | null
          products_skipped: number | null
          products_updated: number | null
          source: string
          status: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          products_imported?: number | null
          products_skipped?: number | null
          products_updated?: number | null
          source?: string
          status?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          error_message?: string | null
          id?: string
          products_imported?: number | null
          products_skipped?: number | null
          products_updated?: number | null
          source?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      templates: {
        Row: {
          category: string
          config: Json | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          preview_image: string | null
          slug: string
        }
        Insert: {
          category?: string
          config?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          preview_image?: string | null
          slug: string
        }
        Update: {
          category?: string
          config?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          preview_image?: string | null
          slug?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          created_at: string
          id: string
          is_staff_reply: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_staff_reply?: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_staff_reply?: boolean
          message?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string
          id: string
          priority: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description: string
          id?: string
          priority?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          boleto_barcode: string | null
          boleto_due_date: string | null
          boleto_url: string | null
          card_brand: string | null
          card_last4: string | null
          created_at: string
          currency: string | null
          customer_email: string | null
          customer_name: string | null
          id: string
          installments: number | null
          metadata: Json | null
          net_amount: number
          order_id: string | null
          paid_at: string | null
          payment_method: string
          pix_code: string | null
          platform_fee: number | null
          refunded_at: string | null
          status: string
          store_id: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          boleto_barcode?: string | null
          boleto_due_date?: string | null
          boleto_url?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          installments?: number | null
          metadata?: Json | null
          net_amount: number
          order_id?: string | null
          paid_at?: string | null
          payment_method: string
          pix_code?: string | null
          platform_fee?: number | null
          refunded_at?: string | null
          status?: string
          store_id: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          boleto_barcode?: string | null
          boleto_due_date?: string | null
          boleto_url?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          currency?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          installments?: number | null
          metadata?: Json | null
          net_amount?: number
          order_id?: string | null
          paid_at?: string | null
          payment_method?: string
          pix_code?: string | null
          platform_fee?: number | null
          refunded_at?: string | null
          status?: string
          store_id?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "public_store_info"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "store_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_selected_products: {
        Row: {
          custom_description: string | null
          custom_name: string | null
          custom_price: number | null
          global_product_id: string
          id: string
          imported_at: string
          is_active: boolean | null
          user_id: string
        }
        Insert: {
          custom_description?: string | null
          custom_name?: string | null
          custom_price?: number | null
          global_product_id: string
          id?: string
          imported_at?: string
          is_active?: boolean | null
          user_id: string
        }
        Update: {
          custom_description?: string | null
          custom_name?: string | null
          custom_price?: number | null
          global_product_id?: string
          id?: string
          imported_at?: string
          is_active?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_selected_products_global_product_id_fkey"
            columns: ["global_product_id"]
            isOneToOne: false
            referencedRelation: "global_products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_store_info: {
        Row: {
          address: string | null
          business_type: string | null
          created_at: string | null
          id: string | null
          logo_url: string | null
          slug: string | null
          store_name: string | null
          template_type: string | null
          theme: Json | null
        }
        Insert: {
          address?: string | null
          business_type?: string | null
          created_at?: string | null
          id?: string | null
          logo_url?: string | null
          slug?: string | null
          store_name?: string | null
          template_type?: string | null
          theme?: Json | null
        }
        Update: {
          address?: string | null
          business_type?: string | null
          created_at?: string | null
          id?: string | null
          logo_url?: string | null
          slug?: string | null
          store_name?: string | null
          template_type?: string | null
          theme?: Json | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_auth_email: { Args: never; Returns: string }
      get_public_store_by_slug: {
        Args: { store_slug: string }
        Returns: {
          address: string
          business_type: string
          id: string
          logo_url: string
          slug: string
          store_name: string
          template_type: string
          theme: Json
        }[]
      }
      get_public_store_products: {
        Args: { store_slug: string }
        Returns: {
          category: string
          description: string
          featured: boolean
          free_shipping: boolean
          id: string
          image_url: string
          images: string[]
          name: string
          price: number
          promotional_price: number
          rating: number
          reviews_count: number
          shipping_days: number
          sold_count: number
          stock: number
        }[]
      }
      get_shopify_credentials: { Args: { _user_id: string }; Returns: Json }
      get_user_navigation_items: {
        Args: { _section?: string; _user_id: string }
        Returns: {
          feature: string
          icon_name: string
          id: string
          is_active: boolean
          label: string
          order_index: number
          path: string
          section: string
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      set_main_admin: { Args: never; Returns: undefined }
      update_shopify_credentials: {
        Args: { _credentials: Json; _user_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
