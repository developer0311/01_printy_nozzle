import React, { useEffect, useRef, useState } from "react";

import { NavLink, useLocation, useNavigate } from "react-router-dom";

import "../../public/css/navbar.css";
import authServices from "../services/auth.service";
import api from "../services/api.js";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  // Products vs Best Sellers share the /products pathname (only ?sort=
  // differs), so NavLink's default matching lights up BOTH tabs. Highlight
  // exactly one based on the actual query string instead.
  const onProductsPage = location.pathname === "/products";
  const isBestSellingView =
    onProductsPage && new URLSearchParams(location.search).get("sort") === "bestselling";
  const isProductsActive = onProductsPage && !isBestSellingView;
  const isBestSellersActive = onProductsPage && isBestSellingView;

  /* =====================================================
     REFS
     ===================================================== */

  const navbarRef = useRef(null);

  const desktopSearchInputRef = useRef(null);

  const mobileSearchInputRef = useRef(null);

  /* =====================================================
     STATES
     ===================================================== */

  const [menuOpen, setMenuOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);

  const [productsOpen, setProductsOpen] = useState(false);

  const [bestSellerCats, setBestSellerCats] = useState([]);

  const [activeBestSlug, setActiveBestSlug] = useState(null);

  const [bestSellerLoading, setBestSellerLoading] = useState(false);

  const [mobileBestOpen, setMobileBestOpen] = useState(false);

  const [mobileActiveBestSlug, setMobileActiveBestSlug] = useState(null);

  const [accountOpen, setAccountOpen] = useState(false);

  const [search, setSearch] = useState("");

  const [authState, setAuthState] = useState(() => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    return { isLoggedIn: Boolean(token), user };
  });

const readCartCount = () => {
    try {
      const saved = JSON.parse(localStorage.getItem("printy_cart") || "[]");
      return Array.isArray(saved)
        ? saved.reduce((total, item) => total + Number(item.quantity || 1), 0)
        : 0;
    } catch (error) {
      return 0;
    }
  };

  const [cartCount, setCartCount] = useState(readCartCount);

  const [avatarError, setAvatarError] = useState(false);

  // Featured coupon for the announcement bar (null = default shipping text).
  const [announcementCoupon, setAnnouncementCoupon] = useState(null);

  // "Copied!" feedback for the announcement coupon code.
  const [announceCopied, setAnnounceCopied] = useState(false);

  const copyAnnouncementCode = async () => {
    if (!announcementCoupon?.code || announceCopied) return;
    const showCopied = () => {
      setAnnounceCopied(true);
      setTimeout(() => setAnnounceCopied(false), 1600);
    };
    try {
      await navigator.clipboard.writeText(announcementCoupon.code);
      showCopied();
    } catch (error) {
      // Clipboard API unavailable (older browsers / non-secure context).
      try {
        const ta = document.createElement("textarea");
        ta.value = announcementCoupon.code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        showCopied();
      } catch (fallbackError) {
        /* copy unavailable — leave the code visible for manual copy */
      }
    }
  };

  useEffect(() => {
    let active = true;
    api
      .get("/coupons/announcement")
      .then((res) => {
        if (active) setAnnouncementCoupon(res.data?.coupon || null);
      })
      .catch(() => {
        if (active) setAnnouncementCoupon(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const isLoggedIn = authState.isLoggedIn;
  const user = authState.user;
  const showAvatar = Boolean(isLoggedIn && user?.avatar_url) && !avatarError;

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatar_url]);

  /* =====================================================
     CLOSE EVERYTHING
     ===================================================== */

  const closeNavbar = () => {
    setMenuOpen(false);

    setSearchOpen(false);

    setProductsOpen(false);

    setMobileBestOpen(false);

    setAccountOpen(false);
  };

  /* =====================================================
     BEST SELLERS MENU (AUTOMATIC FROM ORDERS)
     ===================================================== */

  useEffect(() => {
    let active = true;
    setBestSellerLoading(true);
    api
      .get("/products/best-sellers/menu")
      .then((res) => {
        if (!active) return;
        const cats = res.data?.categories || [];
        setBestSellerCats(cats);
        if (cats.length > 0) {
          setActiveBestSlug(cats[0].slug);
          setMobileActiveBestSlug(cats[0].slug);
        }
      })
      .catch(() => {
        if (active) setBestSellerCats([]);
      })
      .finally(() => {
        if (active) setBestSellerLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeBestCategory =
    bestSellerCats.find((c) => c.slug === activeBestSlug) || bestSellerCats[0] || null;

  /* =====================================================
     OUTSIDE CLICK + ESCAPE
     ===================================================== */

useEffect(() => {
    const syncAuth = () => {
      const token = localStorage.getItem("token");
      const nextUser = JSON.parse(localStorage.getItem("user") || "null");
      setAuthState({ isLoggedIn: Boolean(token), user: nextUser });
    };

    const syncCart = () => setCartCount(readCartCount());

    window.addEventListener("authChange", syncAuth);
    window.addEventListener("storage", syncAuth);
    window.addEventListener("cartChange", syncCart);
    window.addEventListener("storage", syncCart);
    syncAuth();
    syncCart();

    return () => {
      window.removeEventListener("authChange", syncAuth);
      window.removeEventListener("storage", syncAuth);
      window.removeEventListener("cartChange", syncCart);
      window.removeEventListener("storage", syncCart);
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (navbarRef.current && !navbarRef.current.contains(event.target)) {
        setMenuOpen(false);

        setSearchOpen(false);

        setProductsOpen(false);

        setMobileBestOpen(false);

        setAccountOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);

        setSearchOpen(false);

        setProductsOpen(false);

        setMobileBestOpen(false);

        setAccountOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);

      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  /* =====================================================
     BODY LOCK WHEN MOBILE MENU OPEN
     ===================================================== */

  useEffect(() => {
    if (menuOpen) {
      document.body.classList.add("navbar-menu-open");
    } else {
      document.body.classList.remove("navbar-menu-open");
    }

    return () => {
      document.body.classList.remove("navbar-menu-open");
    };
  }, [menuOpen]);

  /* =====================================================
     SEARCH
     ===================================================== */

  const openSearch = () => {
    setSearchOpen(true);

    setProductsOpen(false);

    setAccountOpen(false);

    /*
      Do NOT close the hamburger here.

      This keeps search independent
      from the menu.
    */

    setTimeout(() => {
      if (window.innerWidth < 992) {
        mobileSearchInputRef.current?.focus();
      } else {
        desktopSearchInputRef.current?.focus();
      }
    }, 100);
  };

  const closeSearch = () => {
    setSearchOpen(false);

    setSearch("");
  };

  const toggleSearch = () => {
    if (searchOpen) {
      closeSearch();
    } else {
      openSearch();
    }
  };

  const handleSearch = (event) => {
    event.preventDefault();

    const value = search.trim();

    if (!value) {
      if (window.innerWidth < 992) {
        mobileSearchInputRef.current?.focus();
      } else {
        desktopSearchInputRef.current?.focus();
      }

      return;
    }

    navigate(`/products?search=${encodeURIComponent(value)}`);

    closeNavbar();
  };

  /* =====================================================
     MOBILE MENU
     ===================================================== */

  const toggleMenu = () => {
    setMenuOpen((previous) => !previous);

    /*
      Hamburger does not control
      the search panel.

      Only close product/account
      dropdowns.
    */

    setProductsOpen(false);

    setMobileBestOpen(false);

    setAccountOpen(false);
  };

  /* =====================================================
     ACCOUNT
     ===================================================== */

  const handleAccount = () => {
    /*
      If user is NOT logged in,
      go directly to login.
    */

    if (!isLoggedIn) {
      closeNavbar();

      navigate("/login");

      return;
    }

    /*
      If user IS logged in,
      toggle profile dropdown.
    */

    setAccountOpen((previous) => !previous);

    setSearchOpen(false);

    setProductsOpen(false);

    setMobileBestOpen(false);
  };

  /* =====================================================
     CART
     ===================================================== */

  const handleCart = () => {
    closeNavbar();

    navigate("/cart");
  };

  /* =====================================================
     RENDER
     ===================================================== */

  return (
    <header className="site-header" ref={navbarRef}>
      {/* =================================================
          ANNOUNCEMENT BAR
          ================================================= */}

      <div className="announcement-bar">
        <div className="announcement-content">
          {announcementCoupon ? (
            <>
              <i className="bi bi-ticket-perforated announcement-icon"></i>

              <span>Use code</span>

              <button
                type="button"
                className="announcement-code"
                onClick={copyAnnouncementCode}
                title="Click to copy code"
              >
                <span>{announcementCoupon.code}</span>
                <i className={`bi ${announceCopied ? "bi-check2" : "bi-clipboard"}`}></i>
              </button>

              <span className="announcement-offer">— {announcementCoupon.text}</span>

              {announceCopied && <span className="announcement-copied">Copied!</span>}

              <span className="announcement-divider">|</span>

              <span>Fast Delivery Across India</span>
            </>
          ) : (
            <>
              <i className="bi bi-truck announcement-icon"></i>

              <span>Free Shipping on orders over ₹999</span>

              <span className="announcement-divider">|</span>

              <span>Fast Delivery Across India</span>
            </>
          )}
        </div>
      </div>

      {/* =================================================
          MAIN NAVBAR
          ================================================= */}

      <div className="main-navbar">
        <div className="navbar-container">
          {/* =================================================
              LOGO
              ================================================= */}

          <NavLink to="/" className="brand-logo" onClick={closeNavbar}>
            <img
              src="/images/logo-shade.png"
              alt="Printy Nozzles"
              className="brand-logo-image"
            />
          </NavLink>

          {/* =================================================
              DESKTOP SEARCH — ALWAYS VISIBLE BESIDE LOGO
              ================================================= */}

          <div className="desktop-search">
            <form className="desktop-search-form" onSubmit={handleSearch}>
              <i className="bi bi-search"></i>

              <input
                ref={desktopSearchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                type="text"
                placeholder="Search products..."
                aria-label="Search products"
              />

              {search && (
                <button
                  type="button"
                  className="desktop-search-clear"
                  onClick={() => {
                    setSearch("");

                    desktopSearchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <i className="bi bi-x"></i>
                </button>
              )}

              <button
                type="submit"
                className="desktop-search-submit"
                aria-label="Submit search"
              >
                <i className="bi bi-arrow-right"></i>
              </button>
            </form>
          </div>

          {/* =================================================
              DESKTOP NAVIGATION
              ================================================= */}

          <nav className="desktop-navigation" aria-label="Main navigation">
            <ul className="main-nav">
              {/* =================================================
                  HOME
                  ================================================= */}

              <li className="nav-item">
                <NavLink
                  to="/"
                  end
                  className={({ isActive }) =>
                    `nav-link-custom ${isActive ? "active" : ""}`
                  }
                  onClick={closeNavbar}
                >
                  Home
                </NavLink>
              </li>

              {/* =================================================
                  PRODUCTS
                  ================================================= */}

              <li className="nav-item products-nav-item">
                <NavLink
                  to="/products"
                  end
                  className={() =>
                    `nav-link-custom ${isProductsActive ? "active" : ""}`
                  }
                  onClick={closeNavbar}
                >
                  <span>Products</span>

                  <i className="bi bi-chevron-down products-arrow"></i>
                </NavLink>

                {/* PRODUCTS DROPDOWN */}

                <div className="products-dropdown">
                  <NavLink to="/products" onClick={closeNavbar}>
                    <i className="bi bi-grid"></i>

                    <span>All Products</span>
                  </NavLink>

                  <NavLink
                    to="/products?category=microcontrollers"
                    onClick={closeNavbar}
                  >
                    <i className="bi bi-cpu"></i>

                    <span>Microcontrollers</span>
                  </NavLink>

                  <NavLink
                    to="/products?category=sensors"
                    onClick={closeNavbar}
                  >
                    <i className="bi bi-broadcast"></i>

                    <span>Sensors & Modules</span>
                  </NavLink>

                  <NavLink
                    to="/products?category=components"
                    onClick={closeNavbar}
                  >
                    <i className="bi bi-diagram-3"></i>

                    <span>Electronic Components</span>
                  </NavLink>

                  <NavLink to="/products?category=tools" onClick={closeNavbar}>
                    <i className="bi bi-tools"></i>

                    <span>Tools & Accessories</span>
                  </NavLink>
                </div>
              </li>

              {/* =================================================
                  BEST SELLERS (AUTOMATIC FROM ORDERS)
                  ================================================= */}

              <li className="nav-item bestseller-nav-item">
                <NavLink
                  to="/products?sort=bestselling"
                  className={() =>
                    `nav-link-custom ${isBestSellersActive ? "active" : ""}`
                  }
                  onClick={closeNavbar}
                >
                  <span>Best Sellers</span>

                  <i className="bi bi-chevron-down products-arrow"></i>
                </NavLink>

                {/* BEST SELLERS MEGA DROPDOWN */}

                <div className="bestseller-dropdown">
                  {bestSellerLoading ? (
                    <div className="bestseller-loading">Loading best sellers...</div>
                  ) : bestSellerCats.length === 0 ? (
                    <div className="bestseller-loading">No best sellers yet.</div>
                  ) : (
                    <>
                      {/* LEFT: TOP 6 CATEGORIES */}

                      <div className="bestseller-categories">
                        <p className="bestseller-panel-title">Top Categories</p>

                        {bestSellerCats.map((cat) => (
                          <button
                            key={cat.slug}
                            type="button"
                            className={`bestseller-cat-btn ${
                              activeBestCategory?.slug === cat.slug ? "active" : ""
                            }`}
                            onMouseEnter={() => setActiveBestSlug(cat.slug)}
                            onFocus={() => setActiveBestSlug(cat.slug)}
                            onClick={() => {
                              closeNavbar();
                              navigate(`/products?category=${encodeURIComponent(cat.slug)}&sort=bestselling`);
                            }}
                          >
                            <span className="bestseller-cat-name">{cat.name}</span>

                            <span className="bestseller-cat-count">
                              {cat.units_sold > 0 ? `${cat.units_sold} sold` : `${cat.product_count} items`}
                            </span>

                            <i className="bi bi-chevron-right"></i>
                          </button>
                        ))}
                      </div>

                      {/* RIGHT: TOP 6 PRODUCTS OF HOVERED CATEGORY */}

                      <div className="bestseller-products">
                        <div className="bestseller-products-head">
                          <p className="bestseller-panel-title">
                            Best in {activeBestCategory?.name || ""}
                          </p>

                          <button
                            type="button"
                            className="bestseller-view-all"
                            onClick={() => {
                              closeNavbar();
                              navigate(
                                `/products?category=${encodeURIComponent(activeBestCategory?.slug || "")}&sort=bestselling`
                              );
                            }}
                          >
                            View all <i className="bi bi-arrow-right"></i>
                          </button>
                        </div>

                        <div className="bestseller-products-grid">
                          {(activeBestCategory?.products || []).slice(0, 6).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="bestseller-product-card"
                              onClick={() => {
                                closeNavbar();
                                navigate(`/products/${p.slug || p.id}`);
                              }}
                            >
                              <span className="bestseller-product-img">
                                {p.primary_image ? (
                                  <img src={p.primary_image} alt={p.name} loading="lazy" />
                                ) : (
                                  <i className="bi bi-image"></i>
                                )}
                              </span>

                              <span className="bestseller-product-info">
                                <span className="bestseller-product-name">{p.name}</span>

                                <span className="bestseller-product-meta">
                                  <span className="bestseller-product-price">₹{p.price}</span>

                                  {Number(p.avg_rating) > 0 && (
                                    <span className="bestseller-product-rating">
                                      <i className="bi bi-star-fill"></i>
                                      {Number(p.avg_rating).toFixed(1)}
                                    </span>
                                  )}
                                </span>

                                {Number(p.total_sold) > 0 && (
                                  <span className="bestseller-product-sold">
                                    {p.total_sold} sold
                                  </span>
                                )}
                              </span>
                            </button>
                          ))}

                          {(activeBestCategory?.products || []).length === 0 && (
                            <div className="bestseller-loading">No products in this category yet.</div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </li>

              {/* =================================================
                  3D PRINTING
                  ================================================= */}

              <li className="nav-item">
                <NavLink
                  to="/3d-printing"
                  className={({ isActive }) =>
                    `nav-link-custom ${isActive ? "active" : ""}`
                  }
                  onClick={closeNavbar}
                >
                  3D Printing
                </NavLink>
              </li>
              
              {/* =================================================
                  CONTACT
                  ================================================= */}

              <li className="nav-item">
                <NavLink
                  to="/contact"
                  className={({ isActive }) =>
                    `nav-link-custom ${isActive ? "active" : ""}`
                  }
                  onClick={closeNavbar}
                >
                  Contact
                </NavLink>
              </li>
            </ul>
          </nav>

          {/* =================================================
              RIGHT ACTIONS
              ================================================= */}

          <div className="navbar-actions">
            {/* =================================================
                MOBILE SEARCH BUTTON
                ================================================= */}

            <button
              type="button"
              className="mobile-search-trigger"
              onClick={toggleSearch}
              aria-label={searchOpen ? "Close search" : "Search"}
            >
              <i className="bi bi-search"></i>
            </button>

            {/* =================================================
                ACCOUNT
                ================================================= */}

            <div className="account-wrapper">
              <button
                type="button"
                className={`nav-icon-btn ${
                  accountOpen ? "account-button-active" : ""
                } ${isLoggedIn ? "account-button-menu" : ""}`}
                onClick={handleAccount}
                aria-label={isLoggedIn ? "My Account" : "Login"}
                aria-expanded={isLoggedIn ? accountOpen : undefined}
                aria-haspopup={isLoggedIn ? "menu" : undefined}
              >
                {showAvatar ? (
                  <img
                    src={user.avatar_url}
                    alt="Profile"
                    className="nav-account-avatar-img"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <i className="bi bi-person"></i>
                )}
                {isLoggedIn && (
                  <i
                    className={`bi bi-chevron-down account-caret ${
                      accountOpen ? "account-caret-open" : ""
                    }`}
                    aria-hidden="true"
                  ></i>
                )}
              </button>

              {/* =================================================
                  LOGIN TOOLTIP
                  ONLY WHEN LOGGED OUT
                  ================================================= */}

              {!isLoggedIn && <span className="account-tooltip">Login</span>}

              {/* =================================================
                  PROFILE DROPDOWN
                  ONLY WHEN LOGGED IN
                  ================================================= */}

              {isLoggedIn && (
                <div
                  className={`account-dropdown ${
                    accountOpen ? "account-dropdown-visible" : ""
                  }`}
                >
                  {/* DROPDOWN HEADER */}

                  <div className="account-dropdown-header">
                    <div className="account-dropdown-avatar">
                      {showAvatar ? (
                        <img
                          src={user.avatar_url}
                          alt="Profile"
                          onError={() => setAvatarError(true)}
                        />
                      ) : (
                        <i className="bi bi-person"></i>
                      )}
                    </div>

                    <div className="account-dropdown-user">
                      <strong>
                        {user?.first_name
                          ? `${user.first_name} ${user.last_name || ""}`.trim()
                          : "My Account"}
                      </strong>

                      <span>{user?.email || "Manage your account"}</span>
                    </div>
                  </div>

                  <div className="account-dropdown-divider"></div>

                  {/* =================================================
                      MY ACCOUNT
                      ================================================= */}

                  <NavLink
                    to="/profile"
                    className="account-dropdown-item"
                    onClick={closeNavbar}
                  >
                    <span className="account-dropdown-icon">
                      <i className="bi bi-person"></i>
                    </span>

                    <span>My Account</span>
                  </NavLink>

                  {/* =================================================
                      CART
                      ================================================= */}

                  <NavLink
                    to="/cart"
                    className="account-dropdown-item"
                    onClick={closeNavbar}
                  >
                    <span className="account-dropdown-icon">
                      <i className="bi bi-cart3"></i>
                    </span>

                    <span>Cart</span>

                    {cartCount > 0 && (
                      <span className="account-dropdown-count">
                        {cartCount}
                      </span>
                    )}
                  </NavLink>

                  {/* =================================================
                      WISHLIST
                      ================================================= */}

                  {/* <NavLink
                    to="/wishlist"
                    className="account-dropdown-item"
                    onClick={closeNavbar}
                  >
                    <span className="account-dropdown-icon">
                      <i className="bi bi-heart"></i>
                    </span>

                    <span>Wishlist</span>
                  </NavLink> */}

                  {/* =================================================
                      MY ORDERS
                      ================================================= */}

                  <NavLink
                    to="/orders"
                    className="account-dropdown-item"
                    onClick={closeNavbar}
                  >
                    <span className="account-dropdown-icon">
                      <i className="bi bi-box-seam"></i>
                    </span>

                    <span>My Orders</span>
                  </NavLink>

                  {user?.role === "admin" && (
                    <NavLink
                      to="/admin"
                      className="mobile-account-button"
                      onClick={closeNavbar}
                    >
                      <span className="mobile-account-icon">
                        <i className="bi bi-speedometer2"></i>
                      </span>

                      <span>Admin Panel</span>
                    </NavLink>
                  )}

                  {user?.role === "admin" && (
                    <NavLink
                      to="/admin"
                      className="account-dropdown-item"
                      onClick={closeNavbar}
                    >
                      <span className="account-dropdown-icon">
                        <i className="bi bi-speedometer2"></i>
                      </span>

                      <span>Admin Panel</span>
                    </NavLink>
                  )}

                  <div className="account-dropdown-divider" />

                  <button
                    type="button"
                    className="account-dropdown-item account-dropdown-item--logout"
                    onClick={() => {
                      closeNavbar();
                      authServices.logout();
                    }}
                  >
                    <span className="account-dropdown-icon">
                      <i className="bi bi-box-arrow-right"></i>
                    </span>

                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>

            {/* =================================================
                CART
                ================================================= */}

            <button
              type="button"
              className="cart-wrapper"
              onClick={handleCart}
              aria-label="Shopping cart"
            >
              <i className="bi bi-cart3"></i>

              {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
            </button>

            {/* =================================================
                MOBILE HAMBURGER
                ================================================= */}

            <button
              type="button"
              className={`menu-toggle ${menuOpen ? "menu-open" : ""}`}
              onClick={toggleMenu}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        </div>

        {/* =================================================
            MOBILE SEARCH PANEL
            ================================================= */}

        <div
          className={`mobile-search-panel ${
            searchOpen ? "search-visible" : ""
          }`}
        >
          <form className="mobile-search-form" onSubmit={handleSearch}>
            <i className="bi bi-search"></i>

            <input
              ref={mobileSearchInputRef}
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search products"
            />

            {search && (
              <button
                type="button"
                className="mobile-search-clear"
                onClick={() => {
                  setSearch("");

                  mobileSearchInputRef.current?.focus();
                }}
                aria-label="Clear search"
              >
                <i className="bi bi-x"></i>
              </button>
            )}

            <button type="submit" className="mobile-search-submit">
              Search
            </button>
          </form>
        </div>

        {/* =================================================
            MOBILE MENU
            ================================================= */}

        <div className={`mobile-menu ${menuOpen ? "mobile-menu-visible" : ""}`}>
          <div className="mobile-menu-inner">
            {/* =================================================
                HOME
                ================================================= */}

            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `mobile-nav-link ${isActive ? "active" : ""}`
              }
              onClick={closeNavbar}
            >
              <span>Home</span>

              <i className="bi bi-chevron-right"></i>
            </NavLink>

            {/* =================================================
                PRODUCTS
                ================================================= */}

            <div className="mobile-products">
              <button
                type="button"
                className={`mobile-nav-link mobile-products-button ${
                  productsOpen ? "active" : ""
                }`}
                onClick={() => {
                  setProductsOpen((previous) => !previous);

                  setMobileBestOpen(false);

                  setAccountOpen(false);
                }}
              >
                <span>Products</span>

                <i
                  className={`bi ${
                    productsOpen ? "bi-chevron-up" : "bi-chevron-down"
                  }`}
                ></i>
              </button>

              {/* PRODUCT SUBMENU */}

              <div
                className={`mobile-products-dropdown ${
                  productsOpen ? "mobile-products-visible" : ""
                }`}
              >
                <NavLink to="/products" onClick={closeNavbar}>
                  <i className="bi bi-grid"></i>

                  <span>All Products</span>
                </NavLink>

                <NavLink
                  to="/products?category=microcontrollers"
                  onClick={closeNavbar}
                >
                  <i className="bi bi-cpu"></i>

                  <span>Microcontrollers</span>
                </NavLink>

                <NavLink to="/products?category=sensors" onClick={closeNavbar}>
                  <i className="bi bi-broadcast"></i>

                  <span>Sensors & Modules</span>
                </NavLink>

                <NavLink
                  to="/products?category=components"
                  onClick={closeNavbar}
                >
                  <i className="bi bi-diagram-3"></i>

                  <span>Electronic Components</span>
                </NavLink>

                <NavLink to="/products?category=tools" onClick={closeNavbar}>
                  <i className="bi bi-tools"></i>

                  <span>Tools & Accessories</span>
                </NavLink>
              </div>
            </div>

            {/* =================================================
                BEST SELLERS (MOBILE — TAP TO EXPAND)
                ================================================= */}

            <div className="mobile-products">
              <button
                type="button"
                className={`mobile-nav-link mobile-products-button ${
                  mobileBestOpen ? "active" : ""
                }`}
                onClick={() => {
                  setMobileBestOpen((previous) => !previous);

                  setProductsOpen(false);

                  setAccountOpen(false);
                }}
              >
                <span>Best Sellers</span>

                <i
                  className={`bi ${
                    mobileBestOpen ? "bi-chevron-up" : "bi-chevron-down"
                  }`}
                ></i>
              </button>

              <div
                className={`mobile-products-dropdown ${
                  mobileBestOpen ? "mobile-products-visible" : ""
                }`}
              >
                <NavLink to="/products?sort=bestselling" onClick={closeNavbar}>
                  <i className="bi bi-trophy"></i>

                  <span>All Best Sellers</span>
                </NavLink>

                {bestSellerCats.map((cat) => {
                  const expanded = mobileActiveBestSlug === cat.slug;
                  return (
                    <div key={cat.slug} className="mobile-best-cat">
                      <button
                        type="button"
                        className="mobile-best-cat-btn"
                        onClick={() =>
                          setMobileActiveBestSlug(expanded ? null : cat.slug)
                        }
                      >
                        <span>{cat.name}</span>

                        <i className={`bi ${expanded ? "bi-chevron-up" : "bi-chevron-down"}`}></i>
                      </button>

                      {expanded && (
                        <div className="mobile-best-products">
                          {(cat.products || []).slice(0, 6).map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              className="mobile-best-product"
                              onClick={() => {
                                closeNavbar();
                                navigate(`/products/${p.slug || p.id}`);
                              }}
                            >
                              <span className="mobile-best-product-img">
                                {p.primary_image ? (
                                  <img src={p.primary_image} alt={p.name} loading="lazy" />
                                ) : (
                                  <i className="bi bi-image"></i>
                                )}
                              </span>

                              <span className="mobile-best-product-name">{p.name}</span>

                              <span className="mobile-best-product-price">₹{p.price}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* =================================================
                3D PRINTING
                ================================================= */}

            <NavLink
              to="/3d-printing"
              className={({ isActive }) =>
                `mobile-nav-link ${isActive ? "active" : ""}`
              }
              onClick={closeNavbar}
            >
              <span>3D Printing</span>

              <i className="bi bi-chevron-right"></i>
            </NavLink>

            {/* =================================================
                CHECKOUT
                ================================================= */}

            <NavLink
              to="/checkout"
              className={({ isActive }) =>
                `mobile-nav-link ${isActive ? "active" : ""}`
              }
              onClick={closeNavbar}
            >
              <span>Checkout</span>

              <i className="bi bi-chevron-right"></i>
            </NavLink>

            {/* =================================================
                CONTACT
                ================================================= */}

            <NavLink
              to="/contact"
              className={({ isActive }) =>
                `mobile-nav-link ${isActive ? "active" : ""}`
              }
              onClick={closeNavbar}
            >
              <span>Contact</span>

              <i className="bi bi-chevron-right"></i>
            </NavLink>

            {/* =================================================
                MOBILE ACCOUNT
                ================================================= */}

            <div className="mobile-account-section">
              {!isLoggedIn ? (
                /* =================================================
                   LOGGED OUT
                   ================================================= */

                <button
                  type="button"
                  className="mobile-account-button"
                  onClick={() => {
                    closeNavbar();

                    navigate("/login");
                  }}
                >
                  <span className="mobile-account-icon">
                    <i className="bi bi-person"></i>
                  </span>

                  <span>Login / Register</span>
                </button>
              ) : (
                /* =================================================
                   LOGGED IN
                   ================================================= */

                <>
                  {/* MY ACCOUNT */}

                  <NavLink
                    to="/profile"
                    className="mobile-account-button"
                    onClick={closeNavbar}
                  >
                    <span className="mobile-account-icon">
                      <i className="bi bi-person"></i>
                    </span>

                    <span>My Account</span>
                  </NavLink>

                  {/* CART */}

                  <NavLink
                    to="/cart"
                    className="mobile-account-button"
                    onClick={closeNavbar}
                  >
                    <span className="mobile-account-icon">
                      <i className="bi bi-cart3"></i>

                      {cartCount > 0 && (
                        <span className="mobile-account-badge">
                          {cartCount}
                        </span>
                      )}
                    </span>

                    <span>Cart</span>
                  </NavLink>

                  {/* WISHLIST */}

                  <NavLink
                    to="/wishlist"
                    className="mobile-account-button"
                    onClick={closeNavbar}
                  >
                    <span className="mobile-account-icon">
                      <i className="bi bi-heart"></i>
                    </span>

                    <span>Wishlist</span>
                  </NavLink>

                  {/* MY ORDERS */}

                  <NavLink
                    to="/orders"
                    className="mobile-account-button"
                    onClick={closeNavbar}
                  >
                    <span className="mobile-account-icon">
                      <i className="bi bi-box-seam"></i>
                    </span>

                    <span>My Orders</span>
                  </NavLink>

                  <button
                    type="button"
                    className="mobile-account-button mobile-account-button--logout"
                    onClick={() => {
                      closeNavbar();
                      authServices.logout();
                    }}
                  >
                    <span className="mobile-account-icon">
                      <i className="bi bi-box-arrow-right"></i>
                    </span>

                    <span>Logout</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
