import "./globals.css";

export const metadata = {
  title: "D2C Shopify AutoLister | Intelligent Self-Learning Listing Generator",
  description: "Automated Shopify product CSV generation using persistent column mapping, category brand assignment, Myntra specs formatting, and conflict validation layers.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="font-sans antialiased text-foreground bg-background min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
