if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';

        document.body.addEventListener('click', (event) => {
          if (event.target.matches('.one-time-purches')) {
            this.usersubscription(event.target.closest('.one-time-purches'),event);
          }
        });

        document.body.addEventListener('change', (event) => {
          if (event.target.matches('.subscription-selector')) {
            this.usersubscription(event.target.closest('.subscription-selector'),event);
          }
        });

        this.cartTimerInterval = null;
        document.addEventListener('DOMContentLoaded', (event) => {
          if (localStorage.getItem("cart_reserved_end")) {
            this.CartTimer(false, this.cartTimerInterval);
          }
        })

        // document.body.addEventListener('change', (e) => {

          //   if (!e.target.classList.contains('shipping-protection-checkbox')) return;

          //   const checkbox = e.target;
          //   const shipId = document.body.dataset.shippingProtectionId;
          //   const isChecked = checkbox.checked;

          //   fetch('/cart.js')
          //     .then(res => res.json())
          //     .then(cart => {

          //       const hasShip = cart.items.some(item => item.variant_id == shipId);

          //       if (isChecked && !hasShip) {
          //         this.AddShippingProtection(shipId);
          //       }

          //       if (!isChecked && hasShip) {
          //         this.UpdateShippingProtection(shipId);
          //       }

          //     });
        // });
      }
      
      usersubscription(value,event){
          event.preventDefault();

        // console.log(value,"val")
        // e.preventDefault();
        var lineItemKey = value.dataset.lineItemKey;
        // console.log(lineItemKey,"lineItemKey");

        const quantity = value.dataset.quantity;
        // console.log(quantity,"quantity");

        var newSellingPlanId = value.value;
        // console.log(newSellingPlanId,"newSellingPlanId");

        fetch('/cart/change.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            id: lineItemKey,
            quantity: quantity,
            selling_plan: newSellingPlanId,
            sections: this.cart.getSectionsToRender().map((section) => section.id)
          })
        })
        .then(response => response.json())
        .then(response => {
          console.log(response,'response');
          this.cart.renderContents(response);
        })
        .catch(error => {
            console.error('Error ', error);
        });
      }

      getGiftVariantIds() {
        let ids = [];
        $('.gift-item').each(function () {
          const id = $(this).data('gift-id');
          console.log(id,"id")
          ids.push(id);
        });
        return ids;
      }

      onSubmitHandler(evt) {
        


          evt.preventDefault();
          if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

          this.handleErrorMessage();

          this.submitButton.setAttribute('aria-disabled', true);
          this.submitButton.classList.add('loading');
          this.querySelector('.loading__spinner').classList.remove('hidden');

          const config = fetchConfig('javascript');
          config.headers['X-Requested-With'] = 'XMLHttpRequest';
          delete config.headers['Content-Type'];


          const selectProductData = document.querySelector('.bundle-product-select');

          if(selectProductData){
            const formData = new FormData(this.form);
            if (this.cart) {
              formData.append(
                'sections',
                this.cart.getSectionsToRender().map((section) => section.id)
              );
              formData.append('sections_url', window.location.pathname);
              this.cart.setActiveElement(document.activeElement);
            }
            config.body = formData;

            const mainVariantId = this.form.querySelector('[name="id"]').value;
            console.log(mainVariantId,"mainVariantId"); 
            
            const freeProductId = document.querySelector('body').dataset.freeProductId;
            let uniqueId = Math.floor(Math.random() * 1000000000);

            const qtyInput = this.form.elements['quantity'];
            const qty = parseInt(qtyInput?.value || 1, 10);
            console.log(qtyInput);
            console.log(qty);

            let items = [
              {
                id: mainVariantId,
                quantity: qty,
                properties: {
                  _bundle_parent: true,
                  _bundle_id: uniqueId
                }
              },
              {
                id: freeProductId,
                parent_id: mainVariantId,
                quantity: 1,
                properties: {
                  _bundle_child: true,
                  _bundle_id: uniqueId,
                  _is_free_product: true
                }
              },
            ]

            const checkedRadio = document.querySelector('.extra-product-radio:checked');
            if (checkedRadio && checkedRadio.value === 'yes' ) {
              items.push({
                id: checkedRadio.dataset.extraProduct,
                quantity: qty
              });
            }

            let productIds = [];
            let bundleSelect = document.querySelector('.bundle-product-select');
            if (bundleSelect && bundleSelect.value) {
              productIds = bundleSelect.value.split(',');
            }
            console.log(productIds);

            productIds.forEach((id) => {
              if(id == "I don't want to"){
                id = '';
              }
              if(id){
                items.push({
                  id: id,
                  parent_id: mainVariantId,
                  quantity: qty,
                  properties: {
                    _bundle_child: true,
                    _bundle_id: uniqueId
                  }
                });
              }
            });

            fetch('/cart/add.js', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ items })
            })
            // fetch(`${routes.cart_add_url}`, config)
              .then((response) => response.json())
              .then((response) => {
                if (response.status) {
                  publish(PUB_SUB_EVENTS.cartError, {
                    source: 'product-form',
                    productVariantId: formData.get('id'),
                    errors: response.errors || response.description,
                    message: response.message,
                  });
                  this.handleErrorMessage(response.description);

                  const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
                  if (!soldOutMessage) return;
                  this.submitButton.setAttribute('aria-disabled', true);
                  this.submitButtonText.classList.add('hidden');
                  soldOutMessage.classList.remove('hidden');
                  this.error = true;
                  return;
                } else if (!this.cart) {
                  window.location = window.routes.cart_url;
                  return;
                }

                const startMarker = CartPerformance.createStartingMarker('add:wait-for-subscribers');
                if (!this.error)
                  publish(PUB_SUB_EVENTS.cartUpdate, {
                    source: 'product-form',
                    productVariantId: formData.get('id'),
                    cartData: response,
                  }).then(() => {
                    CartPerformance.measureFromMarker('add:wait-for-subscribers', startMarker);
                  });
                this.error = false;
                const quickAddModal = this.closest('quick-add-modal');
                if (quickAddModal) {
                  document.body.addEventListener(
                    'modalClosed',
                    () => {
                      setTimeout(() => {
                        CartPerformance.measure("add:paint-updated-sections", () => {
                          fetch(`${routes.cart_url}?sections=cart-drawer,cart-icon-bubble`)
                            .then((res) => res.json())
                            .then((sections) => {
                              this.cart.renderContents({
                                sections: sections,
                              });
                            });
                        });
                      });
                    },
                    { once: true }
                  );
                  quickAddModal.hide(true);
                } else {
                  CartPerformance.measure("add:paint-updated-sections", () => {
                    fetch(`${routes.cart_url}?sections=cart-drawer,cart-icon-bubble`)
                      .then((res) => res.json())
                      .then((sections) => {
                        this.cart.renderContents({
                          sections: sections,
                        });
                      });
                  });
                }
              })
              .catch((e) => {
                console.error(e);
              })
              .finally(() => {
                this.submitButton.classList.remove('loading');
                if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
                if (!this.error) this.submitButton.removeAttribute('aria-disabled');
                this.querySelector('.loading__spinner').classList.add('hidden');

                CartPerformance.measureFromEvent("add:user-action", evt);
              });
          }
          else{


            
          const mainVariantId = this.form.querySelector('[name="id"]').value;
          const qty = parseInt(this.form.querySelector('[name="quantity"]')?.value) || 1;

          const unlockedGifts = document.querySelectorAll('.gift-item:not(.locked)');
          const metaproduct = document.querySelectorAll('.metafield_product input[name="id[]"]:checked');

          const uniqueId = Math.floor(Math.random() * 1000000000);

          let items = [];

          // BUNDLE gift product
          if (unlockedGifts.length > 0) {
            items.push({
              id: mainVariantId,
              quantity: qty,
              properties: { _group: uniqueId }
            });

            unlockedGifts.forEach(gift => {
              items.push({
                id: gift.dataset.giftId,
                quantity: qty,
                properties: {
                  _group: uniqueId,
                  parent_id: mainVariantId
                }
              });
            });
          }
          else if (metaproduct.length > 0) {   // METAFIELD
            const uniqueIds = [...new Set(
              Array.from(metaproduct).map(cb => cb.value)
            )];

            items.push({
              id: mainVariantId,
              quantity: qty,
              properties: { unique_identifier: uniqueId }
            });

            uniqueIds.forEach(id => {
              items.push({
                id: id,
                quantity: 1,
                properties: { unique_identifier: uniqueId }
              });
            });
          }
          else {
            items.push({
              id: mainVariantId,
              quantity: qty
            });
          }

          const formData = new FormData();
          items.forEach((item, index) => {

            formData.append(`items[${index}][id]`, item.id);
            formData.append(`items[${index}][quantity]`, item.quantity);
            if (item.properties) {
              Object.keys(item.properties).forEach(key => {
                formData.append(`items[${index}][properties][${key}]`, item.properties[key]);
              });
            }
          });

          if (this.cart) {
            formData.append('sections',this.cart.getSectionsToRender().map(section => section.id));
            formData.append('sections_url', window.location.pathname);
          }

          fetch('/cart/add.js', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
              items: items,
              sections: this.cart.getSectionsToRender().map(section => section.id),
              sections_url: window.location.pathname
            })
          })
          .then(res => res.json())
          .then(response => {
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButtonText.classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            } else if (!this.cart) {
              window.location = window.routes.cart_url;
              return;
            }

            const startMarker = CartPerformance.createStartingMarker('add:wait-for-subscribers');
            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                cartData: response,
              }).then(() => {
                CartPerformance.measureFromMarker('add:wait-for-subscribers', startMarker);
              });
            this.error = false;
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    CartPerformance.measure("add:paint-updated-sections", () => {
                      this.cart.renderContents(response);
                    });
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              CartPerformance.measure("add:paint-updated-sections", () => {
                this.cart.renderContents(response);
              });
            }

             fetch(`${routes.cart_url}`, config)
              .then((res) => res.json())
              .then((res) => {
                console.log(res,"res");

                const price = res.total_price;
                const FREE_GIFT_VARIANT_ID = document.querySelector('body').dataset.freeProduct;
                const hasFreeGift = res.items.some(item => item.variant_id == FREE_GIFT_VARIANT_ID);

                this.addFreeGift(price,hasFreeGift);


                  // const ItemCount = res.item_count;
                  // const shipId = $('.shipping-protection-checkbox').data('shipping-protection-id');
                  // // console.log(shipId,"shipId");
                  // const hasShipData = res.items.some(item => item.variant_id == shipId);
                  // // console.log(hasShipData,"hasShipData1");
                  // if(hasFreeGift) return;
                  // if (!shipId) return;
                  //   this.shippingProtection(hasShipData, ItemCount);

                   
                
              })

              this.CartTimer(true);
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading__spinner').classList.add('hidden');

            CartPerformance.measureFromEvent("add:user-action", evt);
          });

        }

      }

      CartTimer(reset = false) {

        const timerWrapper = $('.cart-reserved-timer');
        if (!timerWrapper.length) return;

        const minutes = parseInt(timerWrapper.data('minutes'));
        let endTime = localStorage.getItem('cart_reserved_end');

        if (reset || !endTime) {
          endTime = Date.now() + minutes * 60 * 1000;
          localStorage.setItem('cart_reserved_end', endTime);
        }

        // OLD TIMER CLEAR
        if (this.cartTimerInterval) {
          clearInterval(this.cartTimerInterval);
        }

        this.cartTimerInterval = setInterval(() => {

          const now = Date.now();
          const distance = endTime - now;

          const mini = Math.floor(distance / (1000 * 60));
          const sec = Math.floor((distance % (1000 * 60)) / 1000);

          $('.cart-timer-countdown').html(mini + "m " + sec + "s");

          if (distance <= 0) {

            clearInterval(this.cartTimerInterval);
            localStorage.removeItem('cart_reserved_end');

            $('.cart-timer-countdown').html("Emptying cart");

            fetch('/cart/clear.js', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sections: ['cart-drawer','main-cart']
              })
            })
            .then((response) => response.json())
            .then((data) => {

              console.log('Cart emptied');

              const cartDrawer = document.querySelector('cart-drawer');

              /* ---------- EMPTY CART ---------- */

              if (data.item_count === 0) {

                fetch('/?section_id=cart-drawer')
                  .then(r => r.text())
                  .then((responseText) => {

                    const html = new DOMParser().parseFromString(responseText, 'text/html');
                    const newDrawer = html.querySelector('cart-drawer');
                    const currentDrawer = document.querySelector('cart-drawer');

                    if (newDrawer && currentDrawer) {

                      const wasOpen = currentDrawer.classList.contains('active');

                      currentDrawer.replaceWith(newDrawer);
                      this.cart = newDrawer;

                      if (wasOpen && typeof newDrawer.open === "function") {
                        newDrawer.open();
                      }
                    }
                  });

                return;
              }

              /* ---------- NORMAL UPDATE ---------- */

              fetch('/cart?sections=cart-drawer,cart-icon-bubble')
                .then(res => res.json())
                .then(sections => {

                  if (cartDrawer) {
                    cartDrawer.renderContents({
                      sections: sections
                    });
                  }

                });

            });

          }

        }, 1000);
      }

      addFreeGift(price, hasFreeGift) {
        const FREE_GIFT_VARIANT_ID = document.querySelector('body').dataset.freeProduct;
        const cartTotal = price / 100;
        const THRESHOLD_AMOUNT = document.querySelector('body').dataset.freeProductPrice;

        console.log(hasFreeGift, "hasFreeGift")
        console.log(cartTotal, "cartTotal")
        console.log(THRESHOLD_AMOUNT, "THRESHOLD_AMOUNT")

        if (!FREE_GIFT_VARIANT_ID) return;

        if (cartTotal >= THRESHOLD_AMOUNT && !hasFreeGift) {

          const data = {
            id: FREE_GIFT_VARIANT_ID,
            quantity: 1,
            sections : this.cart.getSectionsToRender().map((section) => section.id)
          };

          fetch(routes.cart_add_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(data)
          })
          .then((response) => response.json())
          .then(response => {
            this.cart.renderContents(response);
          });

        } 
        else if (cartTotal < THRESHOLD_AMOUNT && hasFreeGift) {
          fetch(routes.cart_update_url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              updates: {
                [FREE_GIFT_VARIANT_ID]: 0
              }
            })
          })
          .then((response) => response.json())
          .then((data) => {

            const cartDrawer = document.querySelector('cart-drawer');

            /* ---------- EMPTY CART ---------- */

            if (data.item_count === 0) {

              fetch('/?section_id=cart-drawer')
              .then(r => r.text())
              .then((responseText) => {

                const html = new DOMParser().parseFromString(responseText, 'text/html');
                const newDrawer = html.querySelector('cart-drawer');
                const currentDrawer = document.querySelector('cart-drawer');

                if (newDrawer && currentDrawer) {

                  const wasOpen = currentDrawer.classList.contains('active');

                  currentDrawer.replaceWith(newDrawer);
                  this.cart = newDrawer;

                  if (wasOpen && typeof newDrawer.open === "function") {
                    newDrawer.open();
                  }
                }
              });
              return;
            }

            /* ---------- NORMAL UPDATE ---------- */
            fetch('/cart?sections=cart-drawer,cart-icon-bubble')
            .then(res => res.json())
            .then(sections => {

              if(cartDrawer){
                cartDrawer.renderContents({
                  sections: sections
                });
              }
            });

          //   fetch('/cart.js')
          //   .then(res => res.json())
          //   .then(cart => {
          //     const ItemCount = cart.item_count;
          //     const shipId = $('.shipping-protection-checkbox').data('shipping-protection-id');
          //     if (!shipId) return;

          //     const FREE_GIFT_VARIANT_ID = document.querySelector('body').dataset.freeProduct;
          //     const hasFreeGift = cart.items.some(item => item.variant_id == FREE_GIFT_VARIANT_ID);

          //     const hasShipData = cart.items.some(item => item.variant_id == shipId);
          //     if(hasFreeGift) return;
          //     this.shippingProtection(hasShipData, ItemCount);
          //   });
          });
        }
      }
 
      // shippingProtection(hasShipData, ItemCount) {
      //   const shipId = $('body').data('shipping-protection-id');
      //   console.log("shipId",shipId);
      //   console.log("hasShipData2",hasShipData);
        
      //   var anableBox = $('.shipping-protection-checkbox');
      //   if(ItemCount == 1){
      //     anableBox = true;
      //   }
      //   else{
      //     anableBox = false;
      //   }
      //   console.log("anableBox",anableBox);

      //     if (!shipId) return;
      //     if(!hasShipData && anableBox ){
      //       this.AddShippingProtection(shipId);
      //     }
      //     else if(ItemCount <= 1 && hasShipData){
      //       this.UpdateShippingProtection(shipId);
      //     }
      // }

      // AddShippingProtection(shipId) {
      //   const self = this;

      //   fetch('/cart/add.js', {
      //     method: 'POST',
      //     headers: {
      //       'Content-Type': 'application/json',
      //       'Accept': 'application/json'
      //     },
      //     body: JSON.stringify({
      //       id: shipId,
      //       quantity: 1,
      //       sections: this.cart.getSectionsToRender().map(section => section.id),
      //       sections_url: window.location.pathname
      //     })
      //   })
      //   .then(res => res.json())
      //   .then(response => {
      //     self.cart.renderContents(response);
      //   })
      //   .catch(err => {
      //     console.log(err);
      //   });

      // }

      // UpdateShippingProtection(shipId){
      //   fetch(routes.cart_update_url, {
      //     method: 'POST',
      //     headers: {
      //       'Content-Type': 'application/json',
      //       'Accept': 'application/json'
      //     },
      //     body: JSON.stringify({
      //       updates: {
      //         [shipId]: 0
      //       }
      //     })
      //   })
      //   .then((response) => response.json())
      //   .then((data) => {
      //     const cartDrawer = document.querySelector('cart-drawer');
      //     if (data.item_count === 0) {
      //       fetch('/?section_id=cart-drawer')
      //         .then(r => r.text())
      //         .then(htmlText => {

      //           const html = new DOMParser().parseFromString(htmlText, 'text/html');
      //           const newDrawer = html.querySelector('cart-drawer');
      //           const currentDrawer = document.querySelector('cart-drawer');

      //           if (newDrawer && currentDrawer) {
      //             currentDrawer.replaceWith(newDrawer);
      //             this.cart = newDrawer;

      //             if (typeof newDrawer.open === "function") {
      //               newDrawer.open();
      //             }
      //           }
      //         });
      //       return;
      //     }
      //     /* -------- NORMAL UPDATE -------- */
      //     fetch('/cart?sections=cart-drawer,cart-icon-bubble')
      //       .then(res => res.json())
      //       .then(sections => {
      //         console.log(sections,"sections")

      //         if(cartDrawer){
      //           cartDrawer.renderContents({
      //             sections: sections
      //           });
      //         }
      //       });
      //   });
      // }
          

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          this.submitButtonText.textContent = window.variantStrings.addToCart;
        }
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}