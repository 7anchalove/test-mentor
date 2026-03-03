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
      admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json | null
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          admin_override_at: string | null
          admin_override_by: string | null
          admin_override_reason: string | null
          archived_by_teacher: boolean
          created_at: string
          id: string
          paid_at: string | null
          payment_note: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          receipt_mime: string | null
          receipt_original_name: string | null
          receipt_path: string | null
          start_date_time: string
          status: Database["public"]["Enums"]["booking_status"]
          student_id: string
          student_test_selection_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          admin_override_at?: string | null
          admin_override_by?: string | null
          admin_override_reason?: string | null
          archived_by_teacher?: boolean
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_note?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          receipt_mime?: string | null
          receipt_original_name?: string | null
          receipt_path?: string | null
          start_date_time: string
          status?: Database["public"]["Enums"]["booking_status"]
          student_id: string
          student_test_selection_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          admin_override_at?: string | null
          admin_override_by?: string | null
          admin_override_reason?: string | null
          archived_by_teacher?: boolean
          created_at?: string
          id?: string
          paid_at?: string | null
          payment_note?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          receipt_mime?: string | null
          receipt_original_name?: string | null
          receipt_path?: string | null
          start_date_time?: string
          status?: Database["public"]["Enums"]["booking_status"]
          student_id?: string
          student_test_selection_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_student_test_selection_id_fkey"
            columns: ["student_test_selection_id"]
            isOneToOne: false
            referencedRelation: "student_test_selections"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          booking_id: string | null
          created_at: string
          id: string
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          id?: string
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          id?: string
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          deleted_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          deleted_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          deleted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
          text: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
          text: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          email: string
          id: string
          is_suspended: boolean | null
          name: string
          role: Database["public"]["Enums"]["app_role"]
          suspended_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email: string
          id?: string
          is_suspended?: boolean | null
          name: string
          role?: Database["public"]["Enums"]["app_role"]
          suspended_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          id?: string
          is_suspended?: boolean | null
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          suspended_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      student_test_selections: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          student_id: string
          test_category: Database["public"]["Enums"]["test_category"]
          test_date_time: string
          test_subtype: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          student_id: string
          test_category: Database["public"]["Enums"]["test_category"]
          test_date_time: string
          test_subtype?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          student_id?: string
          test_category?: Database["public"]["Enums"]["test_category"]
          test_date_time?: string
          test_subtype?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          booking_id: string
          conversation_id: string | null
          created_at: string
          end_date_time: string
          id: string
          meeting_link: string | null
          start_date_time: string
          status: Database["public"]["Enums"]["session_status"]
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          conversation_id?: string | null
          created_at?: string
          end_date_time: string
          id?: string
          meeting_link?: string | null
          start_date_time: string
          status?: Database["public"]["Enums"]["session_status"]
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          conversation_id?: string | null
          created_at?: string
          end_date_time?: string
          id?: string
          meeting_link?: string | null
          start_date_time?: string
          status?: Database["public"]["Enums"]["session_status"]
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_availability_rules: {
        Row: {
          created_at: string
          day_of_week: number
          enabled: boolean
          end_time: string
          id: string
          start_time: string
          teacher_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          enabled?: boolean
          end_time: string
          id?: string
          start_time: string
          teacher_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          enabled?: boolean
          end_time?: string
          id?: string
          start_time?: string
          teacher_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      teacher_profiles: {
        Row: {
          created_at: string
          headline: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean
          subjects: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          headline?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          subjects?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          headline?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          subjects?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      teacher_unavailable_dates: {
        Row: {
          created_at: string
          end_date_time: string
          id: string
          reason: string | null
          start_date_time: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          end_date_time: string
          id?: string
          reason?: string | null
          start_date_time: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          end_date_time?: string
          id?: string
          reason?: string | null
          start_date_time?: string
          teacher_id?: string
        }
        Relationships: []
      }
      tests: {
        Row: {
          category: Database["public"]["Enums"]["test_category"]
          created_at: string
          display_name: string
          id: string
          subtype: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["test_category"]
          created_at?: string
          display_name: string
          id?: string
          subtype?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["test_category"]
          created_at?: string
          display_name?: string
          id?: string
          subtype?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_override_booking_status: {
        Args: { booking_id: string; new_status: string; reason: string }
        Returns: undefined
      }
      admin_set_teacher_suspended: {
        Args: { reason?: string | null; suspended: boolean; teacher_user_id: string }
        Returns: undefined
      }
      create_booking_with_capacity_check: {
        Args: {
          p_student_id: string
          p_teacher_id: string
          p_student_test_selection_id: string
          p_start_date_time: string
        }
        Returns: Database["public"]["Tables"]["bookings"]["Row"][]
      }
      delete_all_conversations_for_me: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      delete_conversation_for_me: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      ensure_conversation_for_booking: {
        Args: { p_booking_id: string }
        Returns: string
      }
      get_teachers_availability: {
        Args: { p_datetime_utc: string; p_test_category?: Database["public"]["Enums"]["test_category"] | null }
        Returns: { teacher_id: string; is_available: boolean; booking_count_at_slot: number; computed_capacity: number; spots_left: number }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_admin: {
        Args: { uid: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "student" | "teacher"
      booking_status: "pending" | "confirmed" | "cancelled" | "awaiting_receipt" | "pending_review" | "declined"
      payment_status: "waiting" | "paid" | "not_paid"
      session_status: "scheduled" | "completed" | "cancelled"
      test_category: "ITA_L2" | "TOLC" | "CENTS" | "CLA"
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
      app_role: ["admin", "student", "teacher"],
      booking_status: ["pending", "confirmed", "cancelled", "awaiting_receipt", "pending_review", "declined"],
      payment_status: ["waiting", "paid", "not_paid"],
      test_category: ["ITA_L2", "TOLC", "CENTS", "CLA"],
    },
  },
} as const
