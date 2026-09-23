// pages/Home.jsx

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../public/css/home.css";

import catalogService, { normalizeProduct } from "../services/catalog.service";

import SkeletonCard from "../components/Loaders/SkeletonCard";
import ErrorState from "../components/ErrorState";

export default function Home() {
  const navigate = useNavigate();

  const [featured, setFeatured] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* =====================================================
     HERO BANNERS (loaded from the database)
  ===================================================== */

  const [heroSlides, setHeroSlides] = useState([]);
  const [activeSlide, setActiveSlide] = useState(0);

  /* =====================================================
     HOME CATEGORIES (loaded from the database)
  ===================================================== */

  const [homeCategories, setHomeCategories] = useState([]);
  const [failedCategoryImages, setFailedCategoryImages] = useState({});

  /* Map a category name/slug to a fallback icon type (used when
     there is no image, or the image URL fails to load) */
  const getCategoryIconType = (name = "", slug = "") => {
    const n = `${name} ${slug}`.toLowerCase();
    if (
      n.includes("micro") ||
      n.includes("controller") ||
      n.includes("arduino") ||
      n.includes("esp32") ||
      n.includes("esp")
    )
      return "cpu";
    if (
      n.includes("sensor") ||
      n.includes("module") ||
      n.includes("iot") ||
      n.includes("communic")
    )
      return "sensor";
    if (
      n.includes("power") ||
      n.includes("battery") ||
      n.includes("supply")
    )
      return "power";
    if (
      n.includes("tool") ||
      n.includes("accessor") ||
      n.includes("cable") ||
      n.includes("wire")
    )
      return "tools";
    if (n.includes("display") || n.includes("lcd") || n.includes("oled") || n.includes("tft"))
      return "display";
    if (n.includes("robot") || n.includes("motor") || n.includes("chassis"))
      return "robot";
    if (
      n.includes("3d") ||
      n.includes("additive") ||
      n.includes("filament") ||
      n.includes("print") ||
      n.includes("nozzle")
    )
      return "box3d";
    return "box";
  };

  /* =====================================================
     AUTO SLIDE
  ===================================================== */

  useEffect(() => {
    if (heroSlides.length <= 1) return;
    const slider = setInterval(() => {
      setActiveSlide((current) => {
        return (current + 1) % heroSlides.length;
      });
    }, 5000);

    return () => clearInterval(slider);
  }, [heroSlides.length]);

  /* =====================================================
     SLIDER CONTROLS
  ===================================================== */

  const nextSlide = () => {
    setActiveSlide((current) => {
      return (current + 1) % heroSlides.length;
    });
  };

  const previousSlide = () => {
    setActiveSlide((current) => {
      return (current - 1 + heroSlides.length) % heroSlides.length;
    });
  };

  const goToSlide = (index) => {
    setActiveSlide(index);
  };

  /* =====================================================
     LOAD HOME DATA (banners, categories, products)
  ===================================================== */

  useEffect(() => {
    let active = true;

    const loadHome = async () => {
      try {
        setLoading(true);
        setError("");
        const [homeRes, productsRes] = await Promise.all([
          catalogService.getHome(),
          catalogService.getProducts({ limit: 6 }),
        ]);

        if (!active) return;

        const homeData = homeRes.data.data || homeRes.data || {};
        const bannerList = homeData.banners || [];
        setHeroSlides(
          bannerList.length
            ? bannerList.map((b) => ({
                id: b.id,
                image: b.image_url,
                title: b.title || "",
                subtitle: b.subtitle || "",
                link: b.link_url || "",
                button: b.button_text || "Shop Now",
              }))
            : [
                { id: "f1", image: "/images/home_hero/01.png" },
                { id: "f2", image: "/images/home_hero/02.png" },
                { id: "f3", image: "/images/home_hero/03.png" },
                { id: "f4", image: "/images/home_hero/04.png" },
                { id: "f5", image: "/images/home_hero/05.png" },
              ]
        );

        const categoryList = homeData.categories || [];
        setHomeCategories(
          categoryList.map((c) => {
            const name = c.name || c.category_name || "Category";
            const slug = c.slug || c.category_slug || "";
            const rawImage =
              c.image_url || c.image || c.category_image || "";
            return {
              name,
              slug,
              image: String(rawImage || "").trim(),
              icon: getCategoryIconType(name, slug),
            };
          })
        );

        const items = (productsRes.data.products || []).map(normalizeProduct);
        setFeatured(items);
      } catch (err) {
        if (active) {
          setHeroSlides([
            { id: "f1", image: "/images/home_hero/01.png" },
            { id: "f2", image: "/images/home_hero/02.png" },
            { id: "f3", image: "/images/home_hero/03.png" },
            { id: "f4", image: "/images/home_hero/04.png" },
            { id: "f5", image: "/images/home_hero/05.png" },
          ]);
          setHomeCategories([]);
          setFeatured([]);
          setError("Unable to load products.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadHome();
    return () => {
      active = false;
    };
  }, []);

  /* =====================================================
     PRODUCT HELPERS
  ===================================================== */

  const getProductName = (product) => {
    return (
      product?.name ||
      product?.title ||
      product?.product_name ||
      "Product"
    );
  };

  const getProductImage = (product) => {
    return (
      product?.image ||
      product?.image_url ||
      product?.imageUrl ||
      product?.product_image ||
      product?.thumbnail ||
      product?.img ||
      "/images/placeholder.png"
    );
  };

  const getProductPrice = (product) => {
    const price =
      product?.price ??
      product?.selling_price ??
      product?.sale_price ??
      product?.actual_price ??
      product?.max_price ??
      0;

    return Number(price);
  };

  const getProductCategory = (product) => {
    return (
      product?.category ||
      product?.category_name ||
      product?.type ||
      ""
    );
  };

  const getProductId = (product, index) => {
    return product?.id ?? product?._id ?? index;
  };

  /* =====================================================
     CATEGORY DATA (loaded from the database above)
  ===================================================== */

  /* =====================================================
     ICONS
  ===================================================== */

  const CategoryIcon = ({ type }) => {
    if (type === "cpu") {
      return (
        <svg viewBox="0 0 24 24">
          <rect x="7" y="7" width="10" height="10" rx="1" />
          <path d="M9 1v4M15 1v4M9 19v4M15 19v4" />
          <path d="M1 9h4M1 15h4M19 9h4M19 15h4" />
        </svg>
      );
    }

    if (type === "sensor") {
      return (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" />
          <path d="M5.6 5.6a9 9 0 0 0 0 12.8" />
          <path d="M18.4 5.6a9 9 0 0 1 0 12.8" />
          <path d="M2.8 2.8a13 13 0 0 0 0 18.4" />
          <path d="M21.2 2.8a13 13 0 0 1 0 18.4" />
        </svg>
      );
    }

    if (type === "power") {
      return (
        <svg viewBox="0 0 24 24">
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </svg>
      );
    }

    if (type === "tools") {
      return (
        <svg viewBox="0 0 24 24">
          <path d="m14.7 6.3 3-3a5 5 0 0 0 0 7.1l-7.1 7.1a3 3 0 1 0 4.2 4.2l7.1-7.1a5 5 0 0 0 0-7.1l-3 3" />
          <path d="m3 3 5.5 5.5" />
        </svg>
      );
    }

    if (type === "display") {
      return (
        <svg viewBox="0 0 24 24">
          <rect x="2" y="4" width="20" height="13" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      );
    }

    if (type === "robot") {
      return (
        <svg viewBox="0 0 24 24">
          <rect x="5" y="8" width="14" height="11" rx="2" />
          <path d="M12 8V4M8 4h8" />
          <circle cx="9.5" cy="13" r="1" />
          <circle cx="14.5" cy="13" r="1" />
          <path d="M9.5 16.5h5" />
          <path d="M2 13v3M22 13v3" />
        </svg>
      );
    }

    if (type === "box3d") {
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 2 3 7v10l9 5 9-5V7z" />
          <path d="m3 7 9 5 9-5" />
          <path d="M12 12v10" />
          <path d="m7.5 4.5 9 5" />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 24 24">
        <path d="m12 2 9 5v10l-9 5-9-5V7z" />
        <path d="m3 7 9 5 9-5" />
        <path d="M12 12v10" />
      </svg>
    );
  };

  /* =====================================================
     CART ICON
  ===================================================== */

  const CartIcon = () => (
    <svg viewBox="0 0 24 24">
      <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.4L21 7H6" />
      <circle cx="10" cy="20" r="1.3" />
      <circle cx="18" cy="20" r="1.3" />
    </svg>
  );

  /* =====================================================
     BENEFITS
  ===================================================== */

  const benefits = [
    {
      icon: "truck",
      title: "Fast Shipping",
      text: "Quick delivery across India",
    },
    {
      icon: "shield",
      title: "Quality Products",
      text: "Tested & trusted components",
    },
    {
      icon: "badge",
      title: "Best Prices",
      text: "Competitive prices for makers",
    },
    {
      icon: "headset",
      title: "Expert Support",
      text: "We're here to help you",
    },
  ];

  const BenefitIcon = ({ type }) => {
    if (type === "truck") {
      return (
        <svg viewBox="0 0 24 24">
          <path d="M3 5h11v11H3z" />
          <path d="M14 9h4l3 3v4h-7z" />
          <circle cx="7" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
        </svg>
      );
    }

    if (type === "shield") {
      return (
        <svg viewBox="0 0 24 24">
          <path d="M12 3 20 6v6c0 5-3.3 8-8 9-4.7-1-8-4-8-9V6z" />
          <path d="m8 12 2.5 2.5L16 9" />
        </svg>
      );
    }

    if (type === "badge") {
      return (
        <svg viewBox="0 0 24 24">
          <path d="m12 2 2.2 2.1 3-.1 1.3 2.7 2.6 1.4-.2 3 1.1 2.8-2.1 2.2-.5 3-3 .6-2.4 1.8-2.4-1.8-3-.6-.5-3-2.1-2.2 1.1-2.8-.2-3 2.6-1.4L7 4l3 .1z" />
          <path d="m8.5 12 2.2 2.2 4.8-4.8" />
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 24 24">
        <path d="M4 13a8 8 0 0 1 16 0v5H4z" />
        <path d="M4 15H2v4h4" />
        <path d="M20 15h2v4h-4" />
        <path d="M9 20h6" />
      </svg>
    );
  };

  /* =====================================================
     RETURN
  ===================================================== */

  return (
    <>
      {/* =================================================
          HERO SECTION
          KEEP YOUR EXISTING HERO SECTION EXACTLY AS IT IS
      ================================================= */}

      <section className="home-hero">

        <div className="home-hero-background">

          {heroSlides.map((slide, index) => (
            <img
              key={slide.id || slide.image}
              src={slide.image}
              alt={slide.title || "Printynozzle electronics and 3D printing"}
              className={`home-hero-image ${
                activeSlide === index ? "is-active" : ""
              }`}
            />
          ))}

        </div>

        <div className="home-hero-overlay"></div>

        <div className="home-hero-content">

          <div className="home-hero-eyebrow">
            <span></span>
            ELECTRONICS &amp; 3D PRINTING
          </div>

          <h1 className="home-hero-title">
            Build. Create.
            <strong>Innovate.</strong>
          </h1>

          <p className="home-hero-description">
            Top quality electronics components
            <br />
            &amp; professional 3D printing services
            <br />
            all in one place.
          </p>

          <div className="home-hero-buttons">

            <button
              type="button"
              className="home-hero-btn home-hero-btn-primary"
              onClick={() => navigate("/products")}
            >
              <span>Shop Electronics</span>

              <svg viewBox="0 0 24 24">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>

            <button
              type="button"
              className="home-hero-btn home-hero-btn-secondary"
              onClick={() => navigate("/3d-printing")}
            >
              <span>Explore 3D Printing</span>

              <svg viewBox="0 0 24 24">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>

          </div>

        </div>

        <div className="home-hero-navigation">

          <button
            type="button"
            className="home-hero-arrow home-hero-arrow-prev"
            onClick={previousSlide}
            aria-label="Previous slide"
          >
            <svg viewBox="0 0 24 24">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          <div className="home-hero-dots">

            {heroSlides.map((_, index) => (
              <button
                key={index}
                type="button"
                className={`home-hero-dot ${
                  activeSlide === index ? "active" : ""
                }`}
                onClick={() => goToSlide(index)}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}

          </div>

          <button
            type="button"
            className="home-hero-arrow home-hero-arrow-next"
            onClick={nextSlide}
            aria-label="Next slide"
          >
            <svg viewBox="0 0 24 24">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>

        </div>

      </section>


      {/* =================================================
          BENEFITS STRIP
      ================================================= */}

      <section className="home-benefits-section">

        <div className="home-benefits-card">

          {benefits.map((benefit, index) => (
            <React.Fragment key={benefit.title}>

              <div className="home-benefit-item">

                <div className="home-benefit-icon">
                  <BenefitIcon type={benefit.icon} />
                </div>

                <div className="home-benefit-content">
                  <h3>{benefit.title}</h3>
                  <p>{benefit.text}</p>
                </div>

              </div>

              {index !== benefits.length - 1 && (
                <div className="home-benefit-divider"></div>
              )}

            </React.Fragment>
          ))}

        </div>

      </section>


      {/* =================================================
          SHOP BY CATEGORY
      ================================================= */}

      <section className="home-category-section">

        <div className="home-section-heading">

          <h2>Shop by Category</h2>

        </div>

        <div className="home-category-grid">

          {homeCategories.map((category) => {
            const image = category.image;
            const imageKey = category.slug || category.name;
            const imageFailed = Boolean(
              failedCategoryImages[imageKey]
            );
            const showImage = Boolean(image) && !imageFailed;

            return (
              <button
                type="button"
                className="home-category-card"
                key={category.slug || category.name}
                onClick={() =>
                  navigate(
                    `/products?category=${encodeURIComponent(
                      category.name
                    )}`
                  )
                }
              >
                <div className="home-category-image">
                  {showImage ? (
                    <img
                      src={image}
                      alt={category.name}
                      loading="lazy"
                      onError={() =>
                        setFailedCategoryImages((prev) =>
                          prev[imageKey]
                            ? prev
                            : { ...prev, [imageKey]: true }
                        )
                      }
                    />
                  ) : (
                    <div className="home-category-icon">
                      <CategoryIcon type={category.icon} />
                    </div>
                  )}
                </div>

                <span>{category.name}</span>
              </button>
            );
          })}


          {/* ALL PRODUCTS */}

          <button
            type="button"
            className="home-category-card home-category-all"
            onClick={() => navigate("/products")}
          >
            <div className="home-category-image">
              <div className="home-all-products-icon">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>

            <span>All Products</span>
          </button>

        </div>

      </section>


      {/* =================================================
          3D PRINTING CTA
      ================================================= */}

      <section className="home-printing-section">

        <div className="home-printing-card">

          <div className="home-printing-content">

            <span className="home-printing-label">
              3D PRINTING
            </span>

            <h2>
              3D Printing
              <br />
              Made Easy
            </h2>

            <ul>

              <li>
                <span className="check-icon">✓</span>
                Upload your 3D model
              </li>

              <li>
                <span className="check-icon">✓</span>
                Choose material &amp; color
              </li>

              <li>
                <span className="check-icon">✓</span>
                Get it printed &amp; delivered
              </li>

            </ul>

            <button
              type="button"
              className="home-printing-btn"
              onClick={() => navigate("/3d-printing")}
            >
              Get Started
              <svg viewBox="0 0 24 24">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>

          </div>


          {/* STEP 1 */}

          <div className="home-printing-step">

            <div className="home-printing-step-header">
              <span className="home-printing-step-number">1</span>
              <h4>Upload File</h4>
            </div>

            <p className="home-printing-step-subtitle">
              Upload your .STL or .OBJ file
            </p>

            <div
              className="home-printing-upload-box"
              onClick={() => navigate("/3d-printing")}
            >
              <span className="home-printing-upload-text">Drag &amp; drop your file</span>
              <span className="home-printing-upload-or">or</span>
              <button
                type="button"
                className="home-printing-choose-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate("/3d-printing");
                }}
              >
                Choose File
              </button>
            </div>

          </div>


          {/* STEP 2 */}

          <div className="home-printing-step">

            <div className="home-printing-step-header">
              <span className="home-printing-step-number">2</span>
              <h4>Choose Color</h4>
            </div>

            <p className="home-printing-step-subtitle">
              Select your preferred color
            </p>

            <div className="home-printing-colors">
              <span className="color-swatch swatch-black" title="Black"></span>
              <span className="color-swatch swatch-white" title="White"></span>
              <span className="color-swatch swatch-gray" title="Gray"></span>
              <span className="color-swatch swatch-red" title="Red"></span>
              <span className="color-swatch swatch-yellow" title="Yellow"></span>
              <span className="color-swatch swatch-green" title="Green"></span>
              <span className="color-swatch swatch-blue" title="Blue"></span>
              <span className="color-swatch swatch-purple" title="Purple"></span>
              <span className="color-swatch swatch-pink" title="Pink"></span>
            </div>

          </div>


          {/* ROCKET */}

          <div className="home-printing-model">

            <div className="home-printing-model-glow"></div>

            <img
              src="/images/rocket.png"
              alt="3D printed rocket"
              className="home-printing-rocket-img"
            />

          </div>

        </div>

      </section>


      {/* =================================================
          POPULAR PRODUCTS
      ================================================= */}

      <section className="home-products-section">

        <div className="home-products-heading">
          <h2>Popular Products</h2>
        </div>


        {loading ? (

          <div className="home-products-grid">

            {[1, 2, 3, 4, 5, 6].map((item) => (
              <SkeletonCard key={item} />
            ))}

          </div>

        ) : error ? (

          <ErrorState message={error} />

        ) : featured.length === 0 ? (

          <div className="home-empty-products text-center py-5">
            <p className="text-muted fs-5">No products available at the moment.</p>
          </div>

        ) : (

          <div className="home-products-grid">

            {featured.map((product, index) => {

              const productId = getProductId(product, index);
              const productName = getProductName(product);
              const productImage = getProductImage(product);
              const productPrice = getProductPrice(product);

              return (
                <article
                  className="home-product-card"
                  key={productId}
                >

                  <button
                    type="button"
                    className="home-product-image"
                    onClick={() =>
                      navigate(`/products/${productId}`)
                    }
                  >

                    <img
                      src={productImage}
                      alt={productName}
                      loading="lazy"
                    />

                  </button>


                  <div className="home-product-info">

                    <button
                      type="button"
                      className="home-product-name"
                      onClick={() =>
                        navigate(`/products/${productId}`)
                      }
                    >
                      {productName}
                    </button>

                    <div className="home-product-bottom">

                      <strong>
                        ₹{productPrice.toLocaleString("en-IN")}
                      </strong>

                      <button
                        type="button"
                        className="home-product-cart"
                        onClick={() =>
                          navigate(`/products/${productId}`)
                        }
                        aria-label={`View ${productName}`}
                      >
                        <CartIcon />
                      </button>

                    </div>

                  </div>

                </article>
              );
            })}

          </div>

        )}

      </section>

    </>
  );
}
