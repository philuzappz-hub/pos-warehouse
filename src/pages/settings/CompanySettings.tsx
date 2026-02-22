import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Company = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_id: string | null;
  logo_url: string | null;
  receipt_footer: string | null;
};

export default function CompanySettings() {
  const { toast } = useToast();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    fetchCompany();
  }, []);

  const fetchCompany = async () => {
    if (!profile?.company_id) return;

    const { data, error } = await supabase
      .from("companies")
      .select("*")
      .eq("id", profile.company_id)
      .single();

    if (error) {
      toast({
        title: "Failed to load company",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setCompany(data);
    }

    setLoading(false);
  };

  const handleSave = async () => {
    if (!company) return;

    setSaving(true);

    const { error } = await supabase
      .from("companies")
      .update({
        name: company.name,
        email: company.email,
        phone: company.phone,
        address: company.address,
        tax_id: company.tax_id,
        logo_url: company.logo_url,
        receipt_footer: company.receipt_footer,
      })
      .eq("id", company.id);

    setSaving(false);

    if (error) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Company updated",
        description: "Changes saved successfully.",
      });
    }
  };

  if (loading) {
    return (
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="text-slate-300 p-6">
          Loading company...
        </CardContent>
      </Card>
    );
  }

  if (!company) {
    return null;
  }

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <CardTitle className="text-white">Company Details</CardTitle>
        <p className="text-sm text-slate-400">
          Update business information used across the system.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label className="text-slate-200">Company Name</Label>
          <Input
            value={company.name}
            onChange={(e) =>
              setCompany({ ...company, name: e.target.value })
            }
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-slate-200">Email</Label>
            <Input
              value={company.email || ""}
              onChange={(e) =>
                setCompany({ ...company, email: e.target.value })
              }
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-200">Phone</Label>
            <Input
              value={company.phone || ""}
              onChange={(e) =>
                setCompany({ ...company, phone: e.target.value })
              }
              className="bg-slate-700 border-slate-600 text-white"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-slate-200">Address</Label>
          <Input
            value={company.address || ""}
            onChange={(e) =>
              setCompany({ ...company, address: e.target.value })
            }
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-slate-200">Tax ID</Label>
          <Input
            value={company.tax_id || ""}
            onChange={(e) =>
              setCompany({ ...company, tax_id: e.target.value })
            }
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-slate-200">Logo URL</Label>
          <Input
            value={company.logo_url || ""}
            onChange={(e) =>
              setCompany({ ...company, logo_url: e.target.value })
            }
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-slate-200">Receipt Footer</Label>
          <Input
            value={company.receipt_footer || ""}
            onChange={(e) =>
              setCompany({ ...company, receipt_footer: e.target.value })
            }
            className="bg-slate-700 border-slate-600 text-white"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </CardContent>
    </Card>
  );
}