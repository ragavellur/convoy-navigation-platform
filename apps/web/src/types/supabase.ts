export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15'
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      cached_routes: {
        Row: {
          alternatives_json: string | null
          created_at: string
          dest_lat: number
          dest_lng: number
          distance: number
          duration: number
          geometry: string
          id: string
          origin_lat: number
          origin_lng: number
          updated_at: string
        }
        Insert: {
          alternatives_json?: string | null
          created_at?: string
          dest_lat: number
          dest_lng: number
          distance: number
          duration: number
          geometry: string
          id?: string
          origin_lat: number
          origin_lng: number
          updated_at?: string
        }
        Update: {
          alternatives_json?: string | null
          created_at?: string
          dest_lat?: number
          dest_lng?: number
          distance?: number
          duration?: number
          geometry?: string
          id?: string
          origin_lat?: number
          origin_lng?: number
          updated_at?: string
        }
        Relationships: []
      }
      convoy_members: {
        Row: {
          assembly_route_geometry: Json | null
          convoy: string
          created_at: string
          id: string
          join_lat: number | null
          join_lng: number | null
          join_name: string | null
          joined_at: string | null
          role: string
          route_geometry: Json | null
          status: string
          updated_at: string
          user: string
          vehicle: string | null
        }
        Insert: {
          assembly_route_geometry?: Json | null
          convoy: string
          created_at?: string
          id?: string
          join_lat?: number | null
          join_lng?: number | null
          join_name?: string | null
          joined_at?: string | null
          role?: string
          route_geometry?: Json | null
          status?: string
          updated_at?: string
          user: string
          vehicle?: string | null
        }
        Update: {
          assembly_route_geometry?: Json | null
          convoy?: string
          created_at?: string
          id?: string
          join_lat?: number | null
          join_lng?: number | null
          join_name?: string | null
          joined_at?: string | null
          role?: string
          route_geometry?: Json | null
          status?: string
          updated_at?: string
          user?: string
          vehicle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'convoy_members_convoy_fkey'
            columns: ['convoy']
            isOneToOne: false
            referencedRelation: 'convoys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'convoy_members_vehicle_fkey'
            columns: ['vehicle']
            isOneToOne: false
            referencedRelation: 'vehicles'
            referencedColumns: ['id']
          },
        ]
      }
      convoys: {
        Row: {
          assembled_members: Json | null
          code: string
          convoy_type: string
          created_at: string
          description: string | null
          dest_lat: number | null
          dest_lng: number | null
          dest_name: string | null
          id: string
          max_members: number | null
          name: string
          owner: string
          phase: string
          security_token: string | null
          settings: Json | null
          source_lat: number | null
          source_lng: number | null
          source_name: string | null
          status: string
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          assembled_members?: Json | null
          code: string
          convoy_type?: string
          created_at?: string
          description?: string | null
          dest_lat?: number | null
          dest_lng?: number | null
          dest_name?: string | null
          id?: string
          max_members?: number | null
          name: string
          owner: string
          phase?: string
          security_token?: string | null
          settings?: Json | null
          source_lat?: number | null
          source_lng?: number | null
          source_name?: string | null
          status?: string
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          assembled_members?: Json | null
          code?: string
          convoy_type?: string
          created_at?: string
          description?: string | null
          dest_lat?: number | null
          dest_lng?: number | null
          dest_name?: string | null
          id?: string
          max_members?: number | null
          name?: string
          owner?: string
          phase?: string
          security_token?: string | null
          settings?: Json | null
          source_lat?: number | null
          source_lng?: number | null
          source_name?: string | null
          status?: string
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          convoy: string
          created_at: string
          duration: number | null
          id: string
          location_lat: number | null
          location_lng: number | null
          sender: string
          type: string
          updated_at: string
        }
        Insert: {
          content: string
          convoy: string
          created_at?: string
          duration?: number | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          sender: string
          type?: string
          updated_at?: string
        }
        Update: {
          content?: string
          convoy?: string
          created_at?: string
          duration?: number | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          sender?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'messages_convoy_fkey'
            columns: ['convoy']
            isOneToOne: false
            referencedRelation: 'convoys'
            referencedColumns: ['id']
          },
        ]
      }
      positions: {
        Row: {
          accuracy: number | null
          convoy: string
          created_at: string
          heading: number | null
          id: string
          lat: number
          lng: number
          speed: number | null
          updated_at: string
          vehicle: string
        }
        Insert: {
          accuracy?: number | null
          convoy: string
          created_at?: string
          heading?: number | null
          id?: string
          lat: number
          lng: number
          speed?: number | null
          updated_at?: string
          vehicle: string
        }
        Update: {
          accuracy?: number | null
          convoy?: string
          created_at?: string
          heading?: number | null
          id?: string
          lat?: number
          lng?: number
          speed?: number | null
          updated_at?: string
          vehicle?: string
        }
        Relationships: [
          {
            foreignKeyName: 'positions_convoy_fkey'
            columns: ['convoy']
            isOneToOne: false
            referencedRelation: 'convoys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'positions_vehicle_fkey'
            columns: ['vehicle']
            isOneToOne: false
            referencedRelation: 'vehicles'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          id: string
          name: string | null
          phone: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          id: string
          name?: string | null
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          id?: string
          name?: string | null
          phone?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string | null
          created_at: string
          endpoint: string
          id: string
          p256dh: string | null
          updated_at: string
          user: string
          user_agent: string | null
        }
        Insert: {
          auth?: string | null
          created_at?: string
          endpoint: string
          id?: string
          p256dh?: string | null
          updated_at?: string
          user: string
          user_agent?: string | null
        }
        Update: {
          auth?: string | null
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string | null
          updated_at?: string
          user?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      telemetry_aggregated: {
        Row: {
          avg_speed: number | null
          created_at: string
          distance_traveled: number | null
          end_lat: number
          end_lng: number
          hour_bucket: string
          id: string
          max_speed: number | null
          point_count: number | null
          route_polyline: string | null
          start_lat: number
          start_lng: number
          updated_at: string
          vehicle: string
        }
        Insert: {
          avg_speed?: number | null
          created_at?: string
          distance_traveled?: number | null
          end_lat: number
          end_lng: number
          hour_bucket: string
          id?: string
          max_speed?: number | null
          point_count?: number | null
          route_polyline?: string | null
          start_lat: number
          start_lng: number
          updated_at?: string
          vehicle: string
        }
        Update: {
          avg_speed?: number | null
          created_at?: string
          distance_traveled?: number | null
          end_lat?: number
          end_lng?: number
          hour_bucket?: string
          id?: string
          max_speed?: number | null
          point_count?: number | null
          route_polyline?: string | null
          start_lat?: number
          start_lng?: number
          updated_at?: string
          vehicle?: string
        }
        Relationships: [
          {
            foreignKeyName: 'telemetry_aggregated_vehicle_fkey'
            columns: ['vehicle']
            isOneToOne: false
            referencedRelation: 'vehicles'
            referencedColumns: ['id']
          },
        ]
      }
      vehicles: {
        Row: {
          color: string | null
          created_at: string
          id: string
          image_url: string | null
          license_plate: string | null
          name: string
          owner: string
          status: string
          telemetry_config: Json | null
          type: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          license_plate?: string | null
          name: string
          owner: string
          status?: string
          telemetry_config?: Json | null
          type: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          license_plate?: string | null
          name?: string
          owner?: string
          status?: string
          telemetry_config?: Json | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      location_shares: {
        Row: {
          convoy: string
          created_at: string
          display_name: string | null
          id: string
          owner: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          convoy: string
          created_at?: string
          display_name?: string | null
          id?: string
          owner?: string
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          convoy?: string
          created_at?: string
          display_name?: string | null
          id?: string
          owner?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'location_shares_convoy_fkey'
            columns: ['convoy']
            isOneToOne: false
            referencedRelation: 'convoys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'location_shares_owner_fkey'
            columns: ['owner']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      resolve_share_token: {
        Args: {
          token: string
        }
        Returns: {
          convoy: string
          convoy_name: string | null
          owner_name: string | null
          phase: string
          display_name: string | null
          status: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
