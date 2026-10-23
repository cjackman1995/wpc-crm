import { Redirect, Slot, router, usePathname } from "expo-router";
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Badge, Button, Loading } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { RefDataProvider } from "@/lib/data";
import { colors } from "@/theme";

const LOGO = require("../../../assets/brand/williams-logo.png");
const EMBLEM = require("../../../assets/brand/williams-emblem.png");

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/leads", label: "Leads" },
  { href: "/tasks", label: "Tasks" },
  { href: "/reports", label: "Reports" },
  { href: "/import", label: "Import" },
  { href: "/team", label: "Team", managerOnly: true },
  { href: "/settings", label: "Settings" },
] as const;

export default function AppLayout() {
  const { loading, session, profile, profileLoading, isManager, signOut } = useAuth();
  const pathname = usePathname();
  const { width } = useWindowDimensions();

  if (loading || (session && !profile && profileLoading)) return <Loading />;
  if (!session) return <Redirect href="/login" />;
  if (!profile || !profile.active) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.text }}>Your account isn't active</Text>
        <Text style={{ color: colors.textSecondary, textAlign: "center" }}>Ask your sales manager to reactivate it.</Text>
        <Button label="Sign out" onPress={signOut} />
      </View>
    );
  }

  const items = NAV.filter((n) => !("managerOnly" in n) || isManager);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const wide = width >= 900;

  const userBlock = (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.text, fontWeight: "600" }} numberOfLines={1}>
        {profile.full_name || profile.email}
      </Text>
      <Badge text={isManager ? "Manager" : "Sales rep"} tone={isManager ? "warn" : "primary"} />
      <Pressable onPress={signOut} role="button">
        <Text style={{ color: colors.textSecondary, textDecorationLine: "underline", fontSize: 13 }}>Sign out</Text>
      </Pressable>
    </View>
  );

  return (
    <RefDataProvider>
      <View style={{ flex: 1, flexDirection: wide ? "row" : "column", height: "100%" as unknown as number }}>
        {wide ? (
          <View
            style={{
              width: 228,
              backgroundColor: colors.nav,
              borderRightWidth: 1,
              borderRightColor: colors.border,
              borderTopWidth: 4,
              borderTopColor: colors.primary,
              paddingVertical: 18,
              paddingHorizontal: 12,
              justifyContent: "space-between",
            }}
          >
            <View style={{ gap: 2 }} role="navigation">
              <View style={{ paddingHorizontal: 6, marginBottom: 18, gap: 6 }}>
                <Image source={LOGO} style={{ width: 196, height: 43 }} resizeMode="contain" accessibilityLabel="Williams Patent Crusher and Pulverizer Co." />
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", paddingLeft: 2 }}>Sales CRM</Text>
              </View>
              {items.map((n) => (
                  <Pressable
                    key={n.href}
                    role="link"
                    onPress={() => router.push(n.href)}
                    style={({ hovered }: { hovered?: boolean; pressed: boolean }) => ({
                      paddingVertical: 9,
                      paddingHorizontal: 10,
                      borderRadius: 6,
                      borderLeftWidth: 3,
                      borderLeftColor: active(n.href) ? colors.primary : "transparent",
                      backgroundColor: active(n.href) ? colors.navActive : hovered ? colors.navHover : "transparent",
                    })}
                  >
                    <Text style={{ color: active(n.href) ? colors.primaryDark : colors.navText, fontWeight: active(n.href) ? "700" : "500" }}>{n.label}</Text>
                  </Pressable>
              ))}
            </View>
            <View style={{ paddingHorizontal: 10 }}>{userBlock}</View>
          </View>
        ) : (
          <View style={{ backgroundColor: colors.nav, paddingTop: 10, borderTopWidth: 4, borderTopColor: colors.primary, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Image source={EMBLEM} style={{ width: 30, height: 30 }} accessibilityLabel="Williams" />
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800" }}>Sales CRM</Text>
              </View>
              <Pressable onPress={signOut}>
                <Text style={{ color: colors.textSecondary, fontSize: 13 }}>Sign out</Text>
              </Pressable>
            </View>
            <ScrollView horizontal contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 4 }} role="navigation">
              {items.map((n) => (
                  <Pressable key={n.href} role="link" onPress={() => router.push(n.href)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, backgroundColor: active(n.href) ? colors.navActive : "transparent" }}>
                    <Text style={{ color: active(n.href) ? colors.primaryDark : colors.navText, fontWeight: "600", fontSize: 13 }}>{n.label}</Text>
                  </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Slot />
        </View>
      </View>
    </RefDataProvider>
  );
}
