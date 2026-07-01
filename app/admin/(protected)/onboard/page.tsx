"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";

interface BankAccount {
  bank_name: string;
  account_number: string;
  account_name: string;
}

export default function OnboardingForm() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    username: "",
    business_name: "", // ← was "name"
    bio_tagline: "", // ← was "tagline"
    location: "",
    whatsapp: "",
    instagram_handle: "", // ← was "instagram"
    tiktok_handle: "", // ← was "tiktok"
    facebook_handle: "", // ← was "facebook"
    product_name: "",
    product_price: "",
    description: "",
  });

  const [banks, setBanks] = useState<BankAccount[]>([
    { bank_name: "OPay", account_number: "", account_name: "" },
  ]);

  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null); // ← new
  const [bannerFile, setBannerFile] = useState<File | null>(null); // ← new
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const popularBanks = [
    "OPay",
    "PalmPay",
    "Moniepoint",
    "Zenith Bank",
    "GTBank",
    "Access Bank",
    "UBA",
    "Kuda Bank",
  ];

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setUserEmail(session.user.email);
        setFormData((prev) => ({
          ...prev,
          business_name: session.user.email!.split("@")[0],
        }));
      }
    };
    checkSession();
  }, []);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBankChange = (
    index: number,
    field: keyof BankAccount,
    value: string,
  ) => {
    const updatedBanks = [...banks];
    updatedBanks[index][field] = value;
    setBanks(updatedBanks);
  };

  const addBankSlot = () => {
    if (banks.length < 3) {
      setBanks([
        ...banks,
        { bank_name: "OPay", account_number: "", account_name: "" },
      ]);
    }
  };

  const removeBankSlot = (index: number) => {
    setBanks(banks.filter((_, i) => i !== index));
  };

  // Upload helper
  const uploadImage = async (file: File, folder: string, prefix: string) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${prefix}-${Date.now()}.${fileExt}`;
    const filePath = `${folder}/${fileName}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(filePath, file);
    if (error) throw error;
    const { data } = supabase.storage
      .from("product-images")
      .getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (
      !formData.username ||
      !formData.business_name ||
      !formData.product_name
    ) {
      setMessage({
        type: "error",
        text: "Please fill out all required fields.",
      });
      setLoading(false);
      return;
    }

    try {
      setUploading(true);
      const usernameSlug = formData.username.trim().toLowerCase();

      // Upload product image
      let finalImageUrl = "";
      if (imageFile) {
        finalImageUrl = await uploadImage(imageFile, "products", usernameSlug);
      }

      // Upload avatar image ← new
      let avatarUrl = "";
      if (avatarFile) {
        avatarUrl = await uploadImage(avatarFile, "avatars", usernameSlug);
      }

      // Upload banner image ← new
      let bannerUrl = "";
      if (bannerFile) {
        bannerUrl = await uploadImage(bannerFile, "banners", usernameSlug);
      }

      setUploading(false);

      const targetIdentifier = userEmail || usernameSlug;
      const formattedPrice = formData.product_price.trim()
        ? formData.product_price.replace(/[^0-9]/g, "")
        : null;

      // 1. Update vendors table with correct column names
      const { data: vendorData, error: vendorError } = await supabase
        .from("vendors")
        .update({
          username: usernameSlug,
          business_name: formData.business_name, // ← fixed
          bio_tagline: formData.bio_tagline, // ← fixed
          location: formData.location,
          whatsapp: formData.whatsapp,
          instagram_handle: formData.instagram_handle, // ← fixed
          tiktok_handle: formData.tiktok_handle, // ← fixed
          facebook_handle: formData.facebook_handle, // ← fixed
          product_name: formData.product_name,
          product_price: formattedPrice,
          product_image: finalImageUrl || undefined,
          description: formData.description,
          avatar_image: avatarUrl || undefined, // ← new
          banner_image: bannerUrl || undefined, // ← new
          is_onboarded: true,
        })
        .eq(userEmail ? "email" : "username", targetIdentifier.toLowerCase())
        .select("id")
        .single();

      if (vendorError) throw vendorError;

      // 2. Insert banks into vendor_banks table ← fixed (was bank_settlement_nodes jsonb)
      if (vendorData?.id && banks.length > 0) {
        // Delete old banks first to avoid duplicates on re-onboard
        await supabase
          .from("vendor_banks")
          .delete()
          .eq("vendor_id", vendorData.id);

        const bankRows = banks
          .filter((b) => b.account_number.trim() !== "")
          .map((b) => ({
            vendor_id: vendorData.id,
            bank_name: b.bank_name,
            account_number: b.account_number,
            account_name: b.account_name,
          }));

        if (bankRows.length > 0) {
          const { error: bankError } = await supabase
            .from("vendor_banks")
            .insert(bankRows);
          if (bankError) throw bankError;
        }
      }

      setMessage({
        type: "success",
        text: `🎉 Setup Complete! Your storefront is now live. Redirecting to your dashboard...`,
      });

      setTimeout(() => {
        router.push("/admin/dashboard"); // ← fixed (was "/dashboard")
      }, 2000);

      setImageFile(null);
      setAvatarFile(null);
      setBannerFile(null);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "An error occurred." });
    } finally {
      setLoading(false);
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 flex justify-center p-4 md:p-8 antialiased">
      <div className="w-full max-w-2xl my-auto space-y-6 py-4">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
            Storefront Setup
          </h1>
          <p className="text-xs text-neutral-500">
            Configure your storefront profile and product listing.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {message && (
            <div
              className={`p-4 rounded-xl text-xs border font-medium ${
                message.type === "success"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-red-50 border-red-200 text-red-700"
              }`}
            >
              {message.text}
            </div>
          )}

          {/* SECTION 1: Brand Identity */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#044766]">
              1. Brand Identity
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  Store Handle*
                </label>
                <div className="flex rounded-xl bg-neutral-50 border border-neutral-200 focus-within:border-[#044766] focus-within:ring-1 focus-within:ring-[#044766] transition-all overflow-hidden">
                  <span className="text-neutral-400 pl-3 py-2.5 text-xs select-none bg-neutral-100 pr-2 border-r border-neutral-200 flex items-center">
                    biomarket.com/
                  </span>
                  <input
                    type="text"
                    name="username"
                    required
                    value={formData.username}
                    onChange={handleChange}
                    placeholder="ada_hub"
                    className="bg-transparent text-xs w-full p-2.5 text-neutral-800 focus:outline-none"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  Business Name*
                </label>
                <input
                  type="text"
                  name="business_name"
                  required
                  value={formData.business_name}
                  onChange={handleChange}
                  placeholder="Ada Fashion Hub"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766] focus:ring-1 focus:ring-[#044766] transition-all"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  Bio / Tagline
                </label>
                <input
                  type="text"
                  name="bio_tagline"
                  value={formData.bio_tagline}
                  onChange={handleChange}
                  placeholder="Quality Ankara & Ready-to-wear"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766] focus:ring-1 focus:ring-[#044766] transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  Location
                </label>
                <input
                  type="text"
                  name="location"
                  value={formData.location}
                  onChange={handleChange}
                  placeholder="Lagos"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766] focus:ring-1 focus:ring-[#044766] transition-all"
                />
              </div>
            </div>

            {/* Avatar & Banner uploads ← new */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  Profile / Avatar Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files && setAvatarFile(e.target.files[0])
                  }
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2 text-xs text-neutral-600 focus:outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-neutral-200 file:text-neutral-700"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  Banner Image
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files && setBannerFile(e.target.files[0])
                  }
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2 text-xs text-neutral-600 focus:outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-neutral-200 file:text-neutral-700"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Bank Details */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#044766]">
                2. Bank Details (Max 3)
              </h2>
              {banks.length < 3 && (
                <button
                  type="button"
                  onClick={addBankSlot}
                  className="text-[11px] text-[#044766] hover:underline font-bold"
                >
                  + Add Bank
                </button>
              )}
            </div>
            <div className="space-y-4 divide-y divide-neutral-100">
              {banks.map((bank, index) => (
                <div
                  key={index}
                  className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${index > 0 ? "pt-4" : ""}`}
                >
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400 font-medium">
                      Bank #{index + 1}
                    </label>
                    <select
                      value={bank.bank_name}
                      onChange={(e) =>
                        handleBankChange(index, "bank_name", e.target.value)
                      }
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766]"
                    >
                      {popularBanks.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400 font-medium">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={bank.account_number}
                      onChange={(e) =>
                        handleBankChange(
                          index,
                          "account_number",
                          e.target.value,
                        )
                      }
                      placeholder="0472567510"
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766] font-mono"
                    />
                  </div>
                  <div className="space-y-1 relative">
                    <label className="text-[11px] text-neutral-400 font-medium">
                      Account Name
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={bank.account_name}
                        onChange={(e) =>
                          handleBankChange(
                            index,
                            "account_name",
                            e.target.value,
                          )
                        }
                        placeholder="Ada Fabrics Ltd"
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766]"
                      />
                      {banks.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBankSlot(index)}
                          className="text-red-500 text-xs hover:text-red-700 p-1"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* SECTION 3: Social Links */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#044766]">
              3. Social & Contact
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  WhatsApp Number*
                </label>
                <input
                  type="text"
                  name="whatsapp"
                  required
                  value={formData.whatsapp}
                  onChange={handleChange}
                  placeholder="2348030000000"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  Instagram URL
                </label>
                <input
                  type="url"
                  name="instagram_handle"
                  value={formData.instagram_handle}
                  onChange={handleChange}
                  placeholder="https://instagram.com/ada_hub"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  TikTok URL
                </label>
                <input
                  type="url"
                  name="tiktok_handle"
                  value={formData.tiktok_handle}
                  onChange={handleChange}
                  placeholder="https://tiktok.com/@ada_hub"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  Facebook URL
                </label>
                <input
                  type="url"
                  name="facebook_handle"
                  value={formData.facebook_handle}
                  onChange={handleChange}
                  placeholder="https://facebook.com/adahub"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766]"
                />
              </div>
            </div>
          </div>

          {/* SECTION 4: Product */}
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4 shadow-sm">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[#044766]">
              4. Featured Product
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  Product Name*
                </label>
                <input
                  type="text"
                  name="product_name"
                  required
                  value={formData.product_name}
                  onChange={handleChange}
                  placeholder="Ankara Gown Style Alpha"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766]"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-neutral-500 font-medium uppercase">
                  Price (₦)
                </label>
                <input
                  type="text"
                  name="product_price"
                  value={formData.product_price}
                  onChange={handleChange}
                  placeholder="12500"
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2.5 text-xs text-neutral-800 focus:outline-none focus:border-[#044766]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] text-neutral-500 font-medium uppercase">
                Product Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  e.target.files && setImageFile(e.target.files[0])
                }
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl p-2 text-xs text-neutral-600 focus:outline-none file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-neutral-200 file:text-neutral-700 hover:file:bg-neutral-300"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || uploading}
            className="w-full bg-[#044766] hover:bg-[#03354c] text-white font-semibold py-3 px-6 rounded-xl text-center transition-all shadow-md uppercase tracking-wider text-xs disabled:bg-neutral-200 disabled:text-neutral-400"
          >
            {uploading
              ? "Uploading images..."
              : loading
                ? "Saving your storefront..."
                : "🚀 Save & Launch Storefront"}
          </button>
        </form>
      </div>
    </div>
  );
}
