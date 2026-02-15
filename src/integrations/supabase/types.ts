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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          branch_id: string | null
          clock_in: string
          clock_out: string | null
          date: string
          id: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          clock_in?: string
          clock_out?: string | null
          date?: string
          id?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          clock_in?: string
          clock_out?: string | null
          date?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string
          company_id: string
          created_at: string
          id: string
          metadata: Json
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          company_id: string
          created_at?: string
          id?: string
          metadata?: Json
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          company_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_user_id?: string | null
        }
        Relationships: []
      }
      auth_user_hook_errors: {
        Row: {
          auth_user_id: string | null
          context: string | null
          created_at: string
          detail: string | null
          email: string | null
          error: string | null
          hint: string | null
          id: number
        }
        Insert: {
          auth_user_id?: string | null
          context?: string | null
          created_at?: string
          detail?: string | null
          email?: string | null
          error?: string | null
          hint?: string | null
          id?: number
        }
        Update: {
          auth_user_id?: string | null
          context?: string | null
          created_at?: string
          detail?: string | null
          email?: string | null
          error?: string | null
          hint?: string | null
          id?: number
        }
        Relationships: []
      }
      branch_products: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          product_id: string
          quantity_in_stock: number
          reorder_level: number | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity_in_stock?: number
          reorder_level?: number | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity_in_stock?: number
          reorder_level?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_products_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          code: string
          company_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          code: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          code?: string
          company_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          receipt_footer: string | null
          tax_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          receipt_footer?: string | null
          tax_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          receipt_footer?: string | null
          tax_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          name: string
          quantity_in_stock: number
          reorder_level: number | null
          sku: string | null
          unit: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          name: string
          quantity_in_stock?: number
          reorder_level?: number | null
          sku?: string | null
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          name?: string
          quantity_in_stock?: number
          reorder_level?: number | null
          sku?: string | null
          unit?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          branch_id: string | null
          company_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          full_name: string
          id: string
          is_admin: boolean | null
          is_attendance_manager: boolean
          is_returns_handler: boolean
          phone: string | null
          role: string | null
          staff_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          branch_id?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          full_name: string
          id?: string
          is_admin?: boolean | null
          is_attendance_manager?: boolean
          is_returns_handler?: boolean
          phone?: string | null
          role?: string | null
          staff_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          branch_id?: string | null
          company_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          full_name?: string
          id?: string
          is_admin?: boolean | null
          is_attendance_manager?: boolean
          is_returns_handler?: boolean
          phone?: string | null
          role?: string | null
          staff_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          created_at: string
          id: string
          initiated_by: string | null
          processed_by: string
          quantity: number
          reason: string | null
          sale_id: string
          sale_item_id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          initiated_by?: string | null
          processed_by: string
          quantity: number
          reason?: string | null
          sale_id: string
          sale_item_id: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          initiated_by?: string | null
          processed_by?: string
          quantity?: number
          reason?: string | null
          sale_id?: string
          sale_item_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "returns_sale_item_id_fkey"
            columns: ["sale_item_id"]
            isOneToOne: false
            referencedRelation: "sale_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_coupons: {
        Row: {
          branch_id: string
          id: string
          issued_at: string
          issued_by: string | null
          print_count: number
          printed_at: string | null
          printed_by: string | null
          received_at: string | null
          received_by: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          sale_id: string
        }
        Insert: {
          branch_id?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          print_count?: number
          printed_at?: string | null
          printed_by?: string | null
          received_at?: string | null
          received_by?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          sale_id: string
        }
        Update: {
          branch_id?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          print_count?: number
          printed_at?: string | null
          printed_by?: string | null
          received_at?: string | null
          received_by?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_coupons_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_coupons_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_items: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          picked: boolean
          picked_at: string | null
          picked_by: string | null
          product_id: string
          quantity: number
          sale_id: string
          unit_price: number
        }
        Insert: {
          branch_id?: string
          created_at?: string
          id?: string
          picked?: boolean
          picked_at?: string | null
          picked_by?: string | null
          product_id: string
          quantity: number
          sale_id: string
          unit_price: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          picked?: boolean
          picked_at?: string | null
          picked_by?: string | null
          product_id?: string
          quantity?: number
          sale_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_returns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string | null
          created_at: string
          id: string
          initiated_by: string | null
          reason: string | null
          sale_id: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          initiated_by?: string | null
          reason?: string | null
          sale_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          initiated_by?: string | null
          reason?: string | null
          sale_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_returns_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_returns_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_id: string
          cashier_id: string
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          is_returned: boolean | null
          print_count: number
          printed_at: string | null
          printed_by: string | null
          receipt_number: string
          return_status: string | null
          status: Database["public"]["Enums"]["order_status"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          branch_id?: string
          cashier_id: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          is_returned?: boolean | null
          print_count?: number
          printed_at?: string | null
          printed_by?: string | null
          receipt_number: string
          return_status?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          cashier_id?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          is_returned?: boolean | null
          print_count?: number
          printed_at?: string | null
          printed_by?: string | null
          receipt_number?: string
          return_status?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receipts: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          received_by: string
          supplier_name: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          received_by: string
          supplier_name?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          received_by?: string
          supplier_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receipts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receiving: {
        Row: {
          applied_at: string | null
          branch_id: string | null
          car_number: string
          created_at: string
          id: string
          notes: string | null
          received_by: string
          received_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          branch_id?: string | null
          car_number: string
          created_at?: string
          id?: string
          notes?: string | null
          received_by: string
          received_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          branch_id?: string | null
          car_number?: string
          created_at?: string
          id?: string
          notes?: string | null
          received_by?: string
          received_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_receiving_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_receiving_items: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          product_id: string
          qty: number
          receiving_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          product_id: string
          qty: number
          receiving_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          product_id?: string
          qty?: number
          receiving_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_receiving_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receiving_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_receiving_items_receiving_id_fkey"
            columns: ["receiving_id"]
            isOneToOne: false
            referencedRelation: "stock_receiving"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouse_receipt_audit: {
        Row: {
          action: string
          actor_id: string | null
          branch_id: string | null
          created_at: string
          from_status: string | null
          id: string
          note: string | null
          receipt_id: string
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          branch_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          receipt_id: string
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          branch_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          note?: string | null
          receipt_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_receipt_audit_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_receipt_audit_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "warehouse_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_receipt_items: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          product_id: string
          quantity: number
          receipt_id: string
          received_by: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          receipt_id: string
          received_by?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          receipt_id?: string
          received_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_receipt_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "warehouse_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_receipts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          car_number: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          receipt_date: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          waybill_urls: Json | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          car_number: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          receipt_date?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          waybill_urls?: Json | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          car_number?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          receipt_date?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          waybill_urls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_receipts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_fk_if_missing: {
        Args: {
          p_constraint_name: string
          p_fk_sql: string
          p_table_name: string
          p_table_schema: string
        }
        Returns: undefined
      }
      approve_return: { Args: { p_return_id: string }; Returns: undefined }
      claim_first_admin: { Args: { _branch_id: string }; Returns: Json }
      create_company_and_claim_admin: {
        Args: { _branch_name: string; _company_name: string }
        Returns: Json
      }
      current_branch_id: { Args: never; Returns: string }
      current_company_id: { Args: never; Returns: string }
      current_profile: {
        Args: never
        Returns: {
          branch_id: string
          company_id: string
          role: string
          user_id: string
        }[]
      }
      generate_receipt_number: { Args: never; Returns: string }
      has_profile_role: {
        Args: { _role: string; _user_id: string }
        Returns: boolean
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | { Args: { role_name: string }; Returns: boolean }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_admin_in_company: { Args: { p_company_id: string }; Returns: boolean }
      is_admin_user: { Args: never; Returns: boolean }
      is_attendance_manager: { Args: { _user_id: string }; Returns: boolean }
      is_cashier:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_returns_handler: { Args: { _user_id: string }; Returns: boolean }
      is_warehouse:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_warehouse_staff: { Args: never; Returns: boolean }
      mark_coupon_printed: { Args: { p_coupon_id: string }; Returns: undefined }
      reissue_sale_coupon: {
        Args: { p_reason: string; p_sale_id: string }
        Returns: string
      }
      warehouse_receive_coupon_by_receipt: {
        Args: { p_receipt_number: string }
        Returns: {
          coupon_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "cashier" | "warehouse" | "staff"
      order_status: "pending" | "picking" | "completed" | "returned"
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
      app_role: ["admin", "cashier", "warehouse", "staff"],
      order_status: ["pending", "picking", "completed", "returned"],
    },
  },
} as const
