import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CompanyRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  /**
   * ✅ Best practice (private bucket):
   * store the STORAGE PATH here, not a public URL.
   * Example: "company/<companyId>/logo.png"
   */
  logo_url: string | null;
  tax_id: string | null;
  receipt_footer: string | null;
};

const LOGO_BUCKET = "company-logos";

// Signed URL TTL (seconds)
// NOTE: signed urls are used only for preview in the UI (private bucket)
const SIGNED_URL_TTL = 60 * 60 * 24; // 24 hours

function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v);
}

export default function SystemSettings() {
  const { toast } = useToast();
  const { profile } = useAuth();

  const companyId = profile?.company_id ?? null;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [company, setCompany] = useState<CompanyRow | null>(null);

  // form state
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [taxId, setTaxId] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");

  // logo upload
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // signed/derived display URL for the currently saved logo (private bucket)
  const [logoDisplayUrl, setLogoDisplayUrl] = useState<string>("");

  // local preview for a newly selected file
  const [localLogoPreview, setLocalLogoPreview] = useState<string>("");

  useEffect(() => {
    if (!logoFile) {
      setLocalLogoPreview("");
      return;
    }
    const objUrl = URL.createObjectURL(logoFile);
    setLocalLogoPreview(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [logoFile]);

  const logoPreview = useMemo(() => {
    // if user picked a file, show it immediately
    if (localLogoPreview) return localLogoPreview;

    // else show the derived signed url (private) or legacy http url
    return logoDisplayUrl || "";
  }, [localLogoPreview, logoDisplayUrl]);

  useEffect(() => {
    if (!companyId) return;
    void loadCompany();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const refreshLogoDisplayUrl = async (logoValue: string | null) => {
    if (!logoValue) {
      setLogoDisplayUrl("");
      return;
    }

    // legacy: if you previously stored a public URL, keep working
    if (isHttpUrl(logoValue)) {
      setLogoDisplayUrl(logoValue);
      return;
    }

    // new: logoValue is a storage path in a private bucket
    const { data, error } = await supabase.storage
      .from(LOGO_BUCKET)
      .createSignedUrl(logoValue, SIGNED_URL_TTL);

    if (error) {
      // Do not block page load
      setLogoDisplayUrl("");
      return;
    }

    setLogoDisplayUrl(data?.signedUrl ?? "");
  };

  const loadCompany = async () => {
    if (!companyId) return;

    setLoading(true);

    const { data, error } = await supabase
      .from("companies")
      .select("id,name,address,phone,email,logo_url,tax_id,receipt_footer")
      .eq("id", companyId)
      .single();

    setLoading(false);

    if (error) {
      toast({
        title: "Failed to load company settings",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    const c = data as CompanyRow;
    setCompany(c);

    setName(c.name ?? "");
    setAddress(c.address ?? "");
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setTaxId(c.tax_id ?? "");
    setReceiptFooter(c.receipt_footer ?? "");

    // derive display url (signed if private)
    await refreshLogoDisplayUrl(c.logo_url);
  };

  const uploadLogoIfNeeded = async (): Promise<string | null> => {
    if (!companyId) return null;
    if (!logoFile) return company?.logo_url ?? null;

    setLogoUploading(true);

    try {
      const ext = logoFile.name.split(".").pop()?.toLowerCase() || "png";
      // ✅ Multi-company safe path convention
      const path = `company/${companyId}/logo.${ext}`;

      // (optional but nice) validate mime type a little
      // Supabase will still accept, but we can catch weird files early
      if (!logoFile.type.startsWith("image/")) {
        throw new Error("Please choose an image file (PNG/JPG/WebP).");
      }

      const { error: upErr } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, logoFile, {
          upsert: true,
          contentType: logoFile.type || undefined,
          cacheControl: "3600",
        });

      if (upErr) throw upErr;

      // ✅ store PATH in DB (private bucket)
      return path;
    } catch (err: any) {
      toast({
        title: "Logo upload failed",
        description: err?.message || "Could not upload logo",
        variant: "destructive",
      });
      return company?.logo_url ?? null;
    } finally {
      setLogoUploading(false);
    }
  };

  const onSave = async () => {
    if (!companyId) return;

    if (!name.trim()) {
      toast({ title: "Company name is required", variant: "destructive" });
      return;
    }

    setSaving(true);

    try {
      const logoValue = await uploadLogoIfNeeded();

      const payload: Partial<CompanyRow> = {
        name: name.trim(),
        address: address.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        tax_id: taxId.trim() || null,
        receipt_footer: receiptFooter.trim() || null,
        // store storage path or legacy url
        logo_url: logoValue || null,
      };

      const { error } = await supabase
        .from("companies")
        .update(payload)
        .eq("id", companyId);

      if (error) {
        toast({
          title: "Save failed",
          description: error.message,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Saved", description: "System settings updated." });

      // ✅ update preview immediately
      await refreshLogoDisplayUrl(payload.logo_url ?? null);

      // reload data to refresh fields + be sure DB is in sync
      await loadCompany();

      setLogoFile(null);
    } finally {
      setSaving(false);
    }
  };

  if (!companyId) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6 text-slate-300">
          No company assigned to your profile.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6 text-slate-300">Loading...</CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">System Settings</CardTitle>
        <p className="text-sm text-slate-400">
          Company identity + receipt settings.
        </p>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Logo */}
        <div className="space-y-2">
          <Label className="text-slate-200">Company Logo</Label>
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-xl border border-slate-700 bg-slate-900/40 flex items-center justify-center overflow-hidden">
              {logoPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoPreview}
                  alt="logo"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-xs text-slate-400">No logo</span>
              )}
            </div>

            <div className="flex-1">
              <Input
                type="file"
                accept="image/*"
                className="bg-slate-700 border-slate-600 text-white"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-slate-400 mt-1">
                PNG/JPG recommended. Uploads to Supabase Storage (private bucket:
                <span className="ml-1 font-mono">{LOGO_BUCKET}</span>).
              </p>
              {company?.logo_url && !isHttpUrl(company.logo_url) && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Stored path: <span className="font-mono">{company.logo_url}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Company name */}
        <div className="space-y-2">
          <Label className="text-slate-200">Company Name *</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>

        {/* Contact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-slate-200">Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white"
              placeholder="+233..."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Email</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-slate-700 border-slate-600 text-white"
              placeholder="info@company.com"
            />
          </div>
        </div>

        {/* Address */}
        <div className="space-y-2">
          <Label className="text-slate-200">Address</Label>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Accra, Ghana"
          />
        </div>

        {/* Tax */}
        <div className="space-y-2">
          <Label className="text-slate-200">Tax ID</Label>
          <Input
            value={taxId}
            onChange={(e) => setTaxId(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white"
            placeholder="Optional"
          />
        </div>

        {/* Receipt footer */}
        <div className="space-y-2">
          <Label className="text-slate-200">Receipt Footer</Label>
          <Textarea
            value={receiptFooter}
            onChange={(e) => setReceiptFooter(e.target.value)}
            className="bg-slate-700 border-slate-600 text-white min-h-[110px]"
            placeholder="e.g. Thanks for your patronage..."
          />
          <p className="text-xs text-slate-400">
            This appears at the bottom of printed receipts.
          </p>
        </div>

        <Button onClick={onSave} className="w-full" disabled={saving || logoUploading}>
          {saving ? "Saving..." : logoUploading ? "Uploading logo..." : "Save Settings"}
        </Button>

        <p className="text-xs text-slate-400">
          This page expects a private bucket named{" "}
          <span className="font-mono">{LOGO_BUCKET}</span> and stores logo paths like{" "}
          <span className="font-mono">company/&lt;company_id&gt;/logo.png</span>.
          The UI preview uses signed URLs.
        </p>
      </CardContent>
    </Card>
  );
}