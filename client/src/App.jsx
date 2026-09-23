import React from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap/dist/js/bootstrap.bundle.min.js";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Routes, Route, useLocation } from "react-router-dom";

import ProtectedRoute from "./components/protected_routes/ProtectedRoute";

import Navbar from "./components/Navbar";
import CouponPopup from "./components/CouponPopup";
import Footer from "./components/Footer";
import ScrollToTop from "./components/ScrollToTop";
import Login from "./views/Login";
import Register from "./views/Register";
import Home from "./views/Home";
import Product from "./views/product";
import ProductDetails from "./views/ProductDetails";
import Cart from "./views/cart";
import Checkout from "./views/checkout";
import Contact from "./views/Contact";
import Profile from "./views/Profile";
import Orders from "./views/Orders";
import OrderDetails from "./views/OrderDetails";
import Printing from "./views/Printing";
import AdminPanel from "./views/AdminPanel";

function App() {
  const location = useLocation();
  const hidePublicShell =
    ["/login", "/register"].includes(location.pathname) ||
    location.pathname.startsWith("/admin");

  return (
    <>
      <ScrollToTop />
      <div className="app-root">
        <div className="app-main d-flex flex-column min-vh-100">
          {!hidePublicShell && <Navbar />}
          {!hidePublicShell && <CouponPopup />}
          <main className="flex-grow-1">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/3d-printing" element={<Printing />} />
              <Route path="/printing" element={<Printing />} />
              <Route path="/products" element={<Product />} />
              <Route path="/product/:id" element={<ProductDetails />} />
              <Route path="/products/:id" element={<ProductDetails />} />
              <Route path="/cart" element={<Cart />} />
              <Route path="/checkout" element={<Checkout />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/orders" element={<Orders />} />
              <Route path="/my-orders" element={<Orders />} />
              <Route path="/orders/:id" element={<OrderDetails />} />
              <Route path="/order/:id" element={<OrderDetails />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />


              {/* PROTECTED ROUTES */}
              <Route element={<ProtectedRoute />}>
                {/* Add protected routes here once auth is wired up */}
              </Route>
              <Route element={<ProtectedRoute roles={["admin"]} />}>
                <Route path="/admin" element={<AdminPanel />} />
              </Route>
            </Routes>
          </main>
          {!hidePublicShell && <Footer />}
        </div>
      </div>
      {/* ✅ TOAST CONTAINER (GLOBAL) */}
      <ToastContainer
        className={"mb-0"}
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        draggable
        theme="light"
      />
    </>
  );
}

export default App;
