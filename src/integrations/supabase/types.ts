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
      credits: {
        Row: {
          created_at: string
          date: string
          id: string
          notes: string | null
          profit: number | null
          quantity: number
          revenue: number | null
          sale_price: number
          status: Database["public"]["Enums"]["credit_status"]
          total_cost: number | null
          unit_cost: number
          user_id: string | null
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          profit?: number | null
          quantity?: number
          revenue?: number | null
          sale_price?: number
          status?: Database["public"]["Enums"]["credit_status"]
          total_cost?: number | null
          unit_cost?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          profit?: number | null
          quantity?: number
          revenue?: number | null
          sale_price?: number
          status?: Database["public"]["Enums"]["credit_status"]
          total_cost?: number | null
          unit_cost?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      renewals: {
        Row: {
          amount: number
          client: string
          created_at: string
          date: string
          due_date: string | null
          id: string
          notes: string | null
          status: Database["public"]["Enums"]["renewal_status"]
          type: Database["public"]["Enums"]["renewal_type"]
          user_id: string | null
        }
        Insert: {
          amount?: number
          client: string
          created_at?: string
          date?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["renewal_status"]
          type?: Database["public"]["Enums"]["renewal_type"]
          user_id?: string | null
        }
        Update: {
          amount?: number
          client?: string
          created_at?: string
          date?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["renewal_status"]
          type?: Database["public"]["Enums"]["renewal_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "renewals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount: number
          client: string
          created_at: string
          date: string
          id: string
          notes: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          sale_type: Database["public"]["Enums"]["sale_type"]
          status: Database["public"]["Enums"]["sale_status"]
          user_id: string | null
        }
        Insert: {
          amount?: number
          client: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          sale_type?: Database["public"]["Enums"]["sale_type"]
          status?: Database["public"]["Enums"]["sale_status"]
          user_id?: string | null
        }
        Update: {
          amount?: number
          client?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          sale_type?: Database["public"]["Enums"]["sale_type"]
          status?: Database["public"]["Enums"]["sale_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users_resellers"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_expenses: {
        Row: {
          amount: number
          campaign: string | null
          created_at: string
          date: string
          id: string
          notes: string | null
          platform: string
        }
        Insert: {
          amount?: number
          campaign?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          platform: string
        }
        Update: {
          amount?: number
          campaign?: string | null
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          platform?: string
        }
        Relationships: []
      }
      users_resellers: {
        Row: {
          created_at: string
          credit_cost: number
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["user_status"]
          type: Database["public"]["Enums"]["user_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          credit_cost?: number
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          type?: Database["public"]["Enums"]["user_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          credit_cost?: number
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          type?: Database["public"]["Enums"]["user_type"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      credit_status: "ativo" | "pendente" | "cancelado"
      payment_method: "pix" | "cartao" | "boleto" | "transferencia" | "outros"
      renewal_status: "ativa" | "pendente" | "vencida" | "cancelada"
      renewal_type: "mensal" | "trimestral" | "semestral" | "anual"
      sale_status: "concluida" | "pendente" | "cancelada"
      sale_type: "nova" | "upgrade" | "outros"
      user_status: "ativo" | "inativo"
      user_type: "principal" | "revenda"
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
      credit_status: ["ativo", "pendente", "cancelado"],
      payment_method: ["pix", "cartao", "boleto", "transferencia", "outros"],
      renewal_status: ["ativa", "pendente", "vencida", "cancelada"],
      renewal_type: ["mensal", "trimestral", "semestral", "anual"],
      sale_status: ["concluida", "pendente", "cancelada"],
      sale_type: ["nova", "upgrade", "outros"],
      user_status: ["ativo", "inativo"],
      user_type: ["principal", "revenda"],
    },
  },
} as const
