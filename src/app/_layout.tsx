import { Slot } from "expo-router";
import Head from "expo-router/head";
import { Text, View } from "react-native";
import { AuthProvider } from "@/lib/auth";
import { isConfigured } from "@/lib/supabase";
import { colors, font } from "@/theme";

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, fontFamily: font.family } as object}>
      <Head>
        <title>Sales CRM</title>
      </Head>
      {isConfigured ? (
        <AuthProvider>
          <Slot />
        </AuthProvider>
      ) : (
        <SetupNeeded />
      )}
    </View>
  );
}

function SetupNeeded() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <View style={{ maxWidth: 520, gap: 10, backgroundColor: "#fff", padding: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ fontSize: 20, fontWeight: "700", color: colors.text }}>Connect Supabase</Text>
        <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
          This app needs EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env, fill in the values
          from your Supabase project (Project Settings → API), and restart. For EAS Hosting, set the same variables in the
          project's environment variables. See README.md.
        </Text>
      </View>
    </View>
  );
}
