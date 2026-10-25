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
      activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          created_at: string
          event_id: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          created_at?: string
          event_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          event_id?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          cover_photo_id: string | null
          created_at: string
          event_id: string
          id: string
          name: string
          type: string
        }
        Insert: {
          cover_photo_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          name: string
          type?: string
        }
        Update: {
          cover_photo_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "albums_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily: {
        Row: {
          day: string
          downloads_count: number
          event_id: string
          guests_count: number
          id: string
          photos_count: number
        }
        Insert: {
          day: string
          downloads_count?: number
          event_id: string
          guests_count?: number
          id?: string
          photos_count?: number
        }
        Update: {
          day?: string
          downloads_count?: number
          event_id?: string
          guests_count?: number
          id?: string
          photos_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_daily_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          guest_id: string | null
          id: string
          photo_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          guest_id?: string | null
          id?: string
          photo_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          guest_id?: string | null
          id?: string
          photo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      downloads: {
        Row: {
          created_at: string
          download_type: string
          event_id: string
          guest_id: string | null
          id: string
          photo_id: string | null
        }
        Insert: {
          created_at?: string
          download_type?: string
          event_id: string
          guest_id?: string | null
          id?: string
          photo_id?: string | null
        }
        Update: {
          created_at?: string
          download_type?: string
          event_id?: string
          guest_id?: string | null
          id?: string
          photo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "downloads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downloads_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downloads_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          allow_comments: boolean
          allow_downloads: boolean
          allow_likes: boolean
          allow_uploads: boolean
          allow_videos: boolean
          cover_image_url: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          event_date: string | null
          expires_at: string | null
          guest_limit: number | null
          id: string
          name: string
          owner_id: string
          password_hash: string | null
          show_exif: boolean
          slug: string
          status: string
          storage_limit_mb: number
          storage_used_mb: number
          theme: Json
          updated_at: string
          venue: string | null
          visibility: string
          watermark_opacity: number | null
          watermark_url: string | null
        }
        Insert: {
          allow_comments?: boolean
          allow_downloads?: boolean
          allow_likes?: boolean
          allow_uploads?: boolean
          allow_videos?: boolean
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          event_date?: string | null
          expires_at?: string | null
          guest_limit?: number | null
          id?: string
          name: string
          owner_id: string
          password_hash?: string | null
          show_exif?: boolean
          slug: string
          status?: string
          storage_limit_mb?: number
          storage_used_mb?: number
          theme?: Json
          updated_at?: string
          venue?: string | null
          visibility?: string
          watermark_opacity?: number | null
          watermark_url?: string | null
        }
        Update: {
          allow_comments?: boolean
          allow_downloads?: boolean
          allow_likes?: boolean
          allow_uploads?: boolean
          allow_videos?: boolean
          cover_image_url?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          event_date?: string | null
          expires_at?: string | null
          guest_limit?: number | null
          id?: string
          name?: string
          owner_id?: string
          password_hash?: string | null
          show_exif?: boolean
          slug?: string
          status?: string
          storage_limit_mb?: number
          storage_used_mb?: number
          theme?: Json
          updated_at?: string
          venue?: string | null
          visibility?: string
          watermark_opacity?: number | null
          watermark_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          created_at: string
          event_id: string
          expires_at: string | null
          file_path: string | null
          id: string
          requested_by: string | null
          scope: Json
          status: string
        }
        Insert: {
          created_at?: string
          event_id: string
          expires_at?: string | null
          file_path?: string | null
          id?: string
          requested_by?: string | null
          scope: Json
          status?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          expires_at?: string | null
          file_path?: string | null
          id?: string
          requested_by?: string | null
          scope?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "exports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_sessions: {
        Row: {
          created_at: string
          expires_at: string
          guest_id: string
          id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          guest_id: string
          id?: string
          token_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          guest_id?: string
          id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_sessions_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          avatar_url: string | null
          device_info: Json | null
          event_id: string
          id: string
          is_blocked: boolean
          joined_at: string
          name: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          device_info?: Json | null
          event_id: string
          id?: string
          is_blocked?: boolean
          joined_at?: string
          name: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          device_info?: Json | null
          event_id?: string
          id?: string
          is_blocked?: boolean
          joined_at?: string
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          invite_link: string
          qr_code_url: string | null
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          invite_link: string
          qr_code_url?: string | null
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          invite_link?: string
          qr_code_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          guest_id: string
          id: string
          photo_id: string
        }
        Insert: {
          created_at?: string
          guest_id: string
          id?: string
          photo_id: string
        }
        Update: {
          created_at?: string
          guest_id?: string
          id?: string
          photo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          payload: Json | null
          read_at: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          payload?: Json | null
          read_at?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          payload?: Json | null
          read_at?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          ai_metadata: Json | null
          album_id: string | null
          created_at: string
          deleted_at: string | null
          duplicate_of_photo_id: string | null
          event_id: string
          exif: Json | null
          filter_applied: string | null
          guest_id: string | null
          height: number | null
          id: string
          is_featured: boolean
          is_pinned: boolean
          media_type: string
          quality_score: number | null
          size_bytes: number | null
          status: string
          storage_path: string
          taken_at: string
          thumbnail_path: string | null
          width: number | null
        }
        Insert: {
          ai_metadata?: Json | null
          album_id?: string | null
          created_at?: string
          deleted_at?: string | null
          duplicate_of_photo_id?: string | null
          event_id: string
          exif?: Json | null
          filter_applied?: string | null
          guest_id?: string | null
          height?: number | null
          id?: string
          is_featured?: boolean
          is_pinned?: boolean
          media_type?: string
          quality_score?: number | null
          size_bytes?: number | null
          status?: string
          storage_path: string
          taken_at?: string
          thumbnail_path?: string | null
          width?: number | null
        }
        Update: {
          ai_metadata?: Json | null
          album_id?: string | null
          created_at?: string
          deleted_at?: string | null
          duplicate_of_photo_id?: string | null
          event_id?: string
          exif?: Json | null
          filter_applied?: string | null
          guest_id?: string | null
          height?: number | null
          id?: string
          is_featured?: boolean
          is_pinned?: boolean
          media_type?: string
          quality_score?: number | null
          size_bytes?: number | null
          status?: string
          storage_path?: string
          taken_at?: string
          thumbnail_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          id: string
          photo_id: string
          reason: string | null
          reported_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          photo_id: string
          reason?: string | null
          reported_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          photo_id?: string
          reason?: string | null
          reported_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "guests"
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
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          plan: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          plan?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          plan?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_event_guest_id: { Args: { _event_id: string }; Returns: string }
      current_guest_id: { Args: never; Returns: string }
      event_comments_open: { Args: { _event_id: string }; Returns: boolean }
      event_is_live: { Args: { _event_id: string }; Returns: boolean }
      event_password_ok: {
        Args: { _hash: string; _password: string }
        Returns: boolean
      }
      event_public_info: {
        Args: { _slug: string }
        Returns: {
          allow_comments: boolean
          allow_downloads: boolean
          allow_likes: boolean
          allow_uploads: boolean
          cover_image_url: string
          description: string
          expires_at: string
          has_password: boolean
          id: string
          name: string
          status: string
          theme: Json
        }[]
      }
      event_uploads_open: { Args: { _event_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      host_event_stats: {
        Args: never
        Returns: {
          event_id: string
          guest_count: number
          last_photo_at: string
          photo_count: number
        }[]
      }
      is_event_guest: { Args: { _event_id: string }; Returns: boolean }
      join_event: {
        Args: {
          _device_id?: string
          _name: string
          _password?: string
          _slug: string
        }
        Returns: Json
      }
      my_guest_session: { Args: { _slug?: string }; Returns: Json }
      photo_event_id: { Args: { _photo_id: string }; Returns: string }
      photo_is_visible: { Args: { _photo_id: string }; Returns: boolean }
      storage_event_id: { Args: { _name: string }; Returns: string }
    }
    Enums: {
      app_role: "admin"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin"],
    },
  },
} as const
