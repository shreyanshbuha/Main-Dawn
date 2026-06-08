  const selectProductData = document.querySelector('.bundle-product-select');

  if(selectProductData){
      class CartRemoveButton extends HTMLElement {
        constructor() {
          super();

          this.addEventListener('click', (event) => {
            event.preventDefault();
            const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
            cartItems.updateQuantity(this.dataset.index, 0, event);
          });
        }
      }

      customElements.define('cart-remove-button', CartRemoveButton);

      class CartItems extends HTMLElement {
        constructor() {
          super();
          this.lineItemStatusElement =
            document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

          const debouncedOnChange = debounce((event) => {
            this.onChange(event);
          }, ON_CHANGE_DEBOUNCE_TIMER);

          this.addEventListener('change', debouncedOnChange.bind(this));
        }

        cartUpdateUnsubscriber = undefined;

        connectedCallback() {
          this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
            if (event.source === 'cart-items') {
              return;
            }
            return this.onCartUpdate();
          });
        }

        disconnectedCallback() {
          if (this.cartUpdateUnsubscriber) {
            this.cartUpdateUnsubscriber();
          }
        }

        resetQuantityInput(id) {
          const input = this.querySelector(`#Quantity-${id}`);
          input.value = input.getAttribute('value');
          this.isEnterPressed = false;
        }

        setValidity(event, index, message) {
          event.target.setCustomValidity(message);
          event.target.reportValidity();
          this.resetQuantityInput(index);
          event.target.select();
        }

        validateQuantity(event) {
          const inputValue = parseInt(event.target.value);
          const index = event.target.dataset.index;
          let message = '';

          if (inputValue < event.target.dataset.min) {
            message = window.quickOrderListStrings.min_error.replace('[min]', event.target.dataset.min);
          } else if (inputValue > parseInt(event.target.max)) {
            message = window.quickOrderListStrings.max_error.replace('[max]', event.target.max);
          } else if (inputValue % parseInt(event.target.step) !== 0) {
            message = window.quickOrderListStrings.step_error.replace('[step]', event.target.step);
          }

          if (message) {
            this.setValidity(event, index, message);
          } else {
            event.target.setCustomValidity('');
            event.target.reportValidity();
            this.updateQuantity(
              index,
              inputValue,
              event,
              document.activeElement.getAttribute('name'),
              event.target.dataset.quantityVariantId
            );
          }
        }

        onChange(event) {
          this.validateQuantity(event);
        }

        onCartUpdate() {
          if (this.tagName === 'CART-DRAWER-ITEMS') {
            return fetch(`${routes.cart_url}?section_id=cart-drawer`)
              .then((response) => response.text())
              .then((responseText) => {
                const html = new DOMParser().parseFromString(responseText, 'text/html');
                const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
                for (const selector of selectors) {
                  const targetElement = document.querySelector(selector);
                  const sourceElement = html.querySelector(selector);
                  if (targetElement && sourceElement) {
                    targetElement.replaceWith(sourceElement);
                  }
                }
              })
              .catch((e) => {
                console.error(e);
              });
          } else {
            return fetch(`${routes.cart_url}?section_id=main-cart-items`)
              .then((response) => response.text())
              .then((responseText) => {
                const html = new DOMParser().parseFromString(responseText, 'text/html');
                const sourceQty = html.querySelector('cart-items');
                this.innerHTML = sourceQty.innerHTML;
              })
              .catch((e) => {
                console.error(e);
              });
          }
        }

        getSectionsToRender() {
          return [
            {
              id: 'main-cart-items',
              section: document.getElementById('main-cart-items').dataset.id,
              selector: '.js-contents',
            },
            {
              id: 'cart-icon-bubble',
              section: 'cart-icon-bubble',
              selector: '.shopify-section',
            },
            {
              id: 'cart-live-region-text',
              section: 'cart-live-region-text',
              selector: '.shopify-section',
            },
            {
              id: 'main-cart-footer',
              section: document.getElementById('main-cart-footer').dataset.id,
              selector: '.js-contents',
            },
          ];
        }
        
        updateQuantity(line, quantity, event, name, variantId) {
          const eventTarget = event.currentTarget instanceof CartRemoveButton ? 'clear' : 'change';
          const cartPerformanceUpdateMarker = CartPerformance.createStartingMarker(`${eventTarget}:user-action`);
          this.enableLoading(line);

          fetch('/cart.js')
            .then((res) => res.json())
            .then((cart) => {

              const currentItem = cart.items[line - 1];
              console.log(currentItem,"currentItem")
              let updates = {
                [currentItem.key]: quantity
              };

              if (currentItem?.properties?._bundle_id) {
                cart.items.forEach((item) => {
                  if ( item.properties?._bundle_child && item.properties?._bundle_id === currentItem.properties._bundle_id) {
                    updates[item.key] =
                      item.properties?._is_free_product
                        ? (quantity > 0 ? 1 : 0)
                        : quantity;
                  }
                });
              }

              return fetch(`${routes.cart_update_url}`, {
                ...fetchConfig(),
                body: JSON.stringify({
                  updates,
                  sections: this.getSectionsToRender().map((section) => section.section),
                  sections_url: window.location.pathname,
                }),
              });
            })
            .then((response) => {
              return response.text();
            })
            .then((state) => {
              const parsedState = JSON.parse(state);

              CartPerformance.measure(`${eventTarget}:paint-updated-sections`, () => {
                const quantityElement =
                  document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
                const items = document.querySelectorAll('.cart-item');

                if (parsedState.errors) {
                  quantityElement.value = quantityElement.getAttribute('value');
                  this.updateLiveRegions(line, parsedState.errors);
                  return;
                }

                this.classList.toggle('is-empty', parsedState.item_count === 0);
                const cartDrawerWrapper = document.querySelector('cart-drawer');
                const cartFooter = document.getElementById('main-cart-footer');

                if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
                if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

                this.getSectionsToRender().forEach((section) => {
                  const elementToReplace =
                    document.getElementById(section.id).querySelector(section.selector) ||
                    document.getElementById(section.id);
                  elementToReplace.innerHTML = this.getSectionInnerHTML(
                    parsedState.sections[section.section],
                    section.selector
                  );
                });
                const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
                let message = '';
                if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
                  if (typeof updatedValue === 'undefined') {
                    message = window.cartStrings.error;
                  } else {
                    message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
                  }
                }
                this.updateLiveRegions(line, message);

                const lineItem =
                  document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
                if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
                  cartDrawerWrapper
                    ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
                    : lineItem.querySelector(`[name="${name}"]`).focus();
                } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
                  trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
                } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
                  trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
                }
              });

              publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: parsedState, variantId: variantId });
            })
            .catch(() => {
              this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));
              const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
              errors.textContent = window.cartStrings.error;
            })
            .finally(() => {
              this.disableLoading(line);
              CartPerformance.measureFromMarker(`${eventTarget}:user-action`, cartPerformanceUpdateMarker);
            });
        }

        updateLiveRegions(line, message) {
          const lineItemError =
            document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
          if (lineItemError) lineItemError.querySelector('.cart-item__error-text').textContent = message;

          this.lineItemStatusElement.setAttribute('aria-hidden', true);

          const cartStatus =
            document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
          cartStatus.setAttribute('aria-hidden', false);

          setTimeout(() => {
            cartStatus.setAttribute('aria-hidden', true);
          }, 1000);
        }

        getSectionInnerHTML(html, selector) {
          return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
        }

        enableLoading(line) {
          const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
          mainCartItems.classList.add('cart__items--disabled');

          const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
          const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

          [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

          document.activeElement.blur();
          this.lineItemStatusElement.setAttribute('aria-hidden', false);
        }

        disableLoading(line) {
          const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
          mainCartItems.classList.remove('cart__items--disabled');

          const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
          const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

          cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
          cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
        }
      }

      customElements.define('cart-items', CartItems);

      if (!customElements.get('cart-note')) {
        customElements.define(
          'cart-note',
          class CartNote extends HTMLElement {
            constructor() {
              super();

              this.addEventListener(
                'input',
                debounce((event) => {
                  const body = JSON.stringify({ note: event.target.value });
                  fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } }).then(() =>
                    CartPerformance.measureFromEvent('note-update:user-action', event)
                  );
                }, ON_CHANGE_DEBOUNCE_TIMER)
              );
            }
          }
        );
      }

  }
  else{
      class CartRemoveButton extends HTMLElement {
        constructor() {
          super();

          this.addEventListener('click', (event) => {
            event.preventDefault();

              const isGift = $(this).data('is-gift');
              console.log(isGift, "isGift");

              if (isGift) {
                console.log("value are blocked");
                return;
              }

            const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');

            const key = this.dataset.lineKey;
            const lineItemproperty = this.dataset.lineItemProperty;
            console.log(lineItemproperty,"lineItemproperty")

            const variantId = this.dataset.quantityVariantId;

            console.log(variantId, "variantId");

            cartItems.updateQuantity( this.dataset.index, 0, event, '', variantId, lineItemproperty, key );
          });
        }
      }

      customElements.define('cart-remove-button', CartRemoveButton);

      class CartItems extends HTMLElement {
        constructor() {
          super();
          this.lineItemStatusElement =
            document.getElementById('shopping-cart-line-item-status') || document.getElementById('CartDrawer-LineItemStatus');

          const debouncedOnChange = debounce((event) => {
            this.onChange(event);
          }, ON_CHANGE_DEBOUNCE_TIMER);

          this.addEventListener('change', debouncedOnChange.bind(this));
        }

        cartUpdateUnsubscriber = undefined;

        connectedCallback() {
          this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
            if (event.source === 'cart-items') {
              return;
            }
            return this.onCartUpdate();
          });
        }

        disconnectedCallback() {
          if (this.cartUpdateUnsubscriber) {
            this.cartUpdateUnsubscriber();
          }
        }

        resetQuantityInput(id) {
          const input = this.querySelector(`#Quantity-${id}`);
          input.value = input.getAttribute('value');
          this.isEnterPressed = false;
        }

        setValidity(event, index, message) {
          event.target.setCustomValidity(message);
          event.target.reportValidity();
          this.resetQuantityInput(index);
          event.target.select();
        }

        validateQuantity(event) {
          const inputValue = parseInt(event.target.value);
          const index = event.target.dataset.index;
          let message = '';

          if (inputValue < event.target.dataset.min) {
            message = window.quickOrderListStrings.min_error.replace('[min]', event.target.dataset.min);
          } else if (inputValue > parseInt(event.target.max)) {
            message = window.quickOrderListStrings.max_error.replace('[max]', event.target.max);
          }
          // else if (inputValue % parseInt(event.target.step) !== 0) {
          //   message = window.quickOrderListStrings.step_error.replace('[step]', event.target.step);
          // }

          if (message) {
            this.setValidity(event, index, message);
          } else {
            event.target.setCustomValidity('');
            event.target.reportValidity();
            this.updateQuantity(
              index,
              inputValue,
              event,
              document.activeElement.getAttribute('name'),
              event.target.dataset.quantityVariantId,
              event.target.dataset.lineItemProperty,
              event.target.dataset.lineKey
            );
          }
        }

        onChange(event) {

          const input = event.target;
          const isGift = input.closest('.quantity-popover-container')?.dataset?.isGift;
          console.log(isGift, "isGift");

          if (isGift === "true") {
            console.log("value are blocked");
            return;
          }

          this.validateQuantity(event);
        }

        onCartUpdate() {
          if (this.tagName === 'CART-DRAWER-ITEMS') {
            return fetch(`${routes.cart_url}?section_id=cart-drawer`)
              .then((response) => response.text())
              .then((responseText) => {
                const html = new DOMParser().parseFromString(responseText, 'text/html');
                const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
                for (const selector of selectors) {
                  const targetElement = document.querySelector(selector);
                  const sourceElement = html.querySelector(selector);
                  if (targetElement && sourceElement) {
                    targetElement.replaceWith(sourceElement);
                  }
                }
              })
              .catch((e) => {
                console.error(e);
              });
          } else {
            return fetch(`${routes.cart_url}?section_id=main-cart-items`)
              .then((response) => response.text())
              .then((responseText) => {
                const html = new DOMParser().parseFromString(responseText, 'text/html');
                const sourceQty = html.querySelector('cart-items');
                this.innerHTML = sourceQty.innerHTML;
              })
              .catch((e) => {
                console.error(e);
              });
          }
        }

        getSectionsToRender() {
          return [
            {
              id: 'main-cart-items',
              section: document.getElementById('main-cart-items').dataset.id,
              selector: '.js-contents',
            },
            {
              id: 'cart-icon-bubble',
              section: 'cart-icon-bubble',
              selector: '.shopify-section',
            },
            {
              id: 'cart-live-region-text',
              section: 'cart-live-region-text',
              selector: '.shopify-section',
            },
            {
              id: 'main-cart-footer',
              section: document.getElementById('main-cart-footer').dataset.id,
              selector: '.js-contents',
            },
          ];
        }

        updateQuantity(line, quantity, event, name, variantId, lineItemproperty, key) {

          // const input = $(this).closest('.cart-quantity').find('.quantity_gift_input');
          // const isGift = input.closest('.quantity-popover-container').data('is-gift');

          // console.log(isGift,"isGift")
          // if (isGift){
          //   console.log("value are blocked")
          //   return;
          // } 

          

          const eventTarget = event.currentTarget instanceof CartRemoveButton ? 'clear' : 'change';
          const cartPerformanceUpdateMarker = CartPerformance.createStartingMarker(`${eventTarget}:user-action`);

          this.enableLoading(line);
          

              // console.log(line,"line");
              // console.log(quantity,"quantity");
              // console.log(event,"event");
              // console.log(name,"name");
              console.log(variantId,"variantId");
              console.log(lineItemproperty,"lineItemproperty");
              console.log(key,"key");

          var qty_array = [];

          $('#CartDrawer-Form [name="updates[]"]').each(function(i,e) {
            if($(this).data('line-item-property') == lineItemproperty){
                qty_array.push(quantity);
                // console.log("1111111");
            }
            else {
                qty_array.push(parseInt($(this).val()) || 0);
                // console.log("22222222");
            }
          });

          let endpoint = "";
          let payload = {};

          if (lineItemproperty && lineItemproperty.length !== 0) {
            endpoint = "update";
            payload = {
              'updates': qty_array,
            };
          } else {
            endpoint = "change";
            payload = {
              id: key,
              quantity: quantity,
            };
          }

            fetch(`/cart/${endpoint}.js`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json"  
              },
              body: JSON.stringify({  
                ...payload,
                sections: this.getSectionsToRender().map((section) => section.section),
                sections_url: window.location.pathname,
              })
            })
            .then((response) => {
              return response.json();
            })
            .then((state) => {

              const productFormElement = document.querySelector('product-form');

              const parsedState = state;

          

              
              CartPerformance.measure(`${eventTarget}:paint-updated-sections`, () => {
                const quantityElement =
                  document.getElementById(`Quantity-${line}`) || document.getElementById(`Drawer-quantity-${line}`);
                const items = document.querySelectorAll('.cart-item');

                if (parsedState.errors) {
                  quantityElement.value = quantityElement.getAttribute('value');
                  this.updateLiveRegions(line, parsedState.errors);
                  return;
                }

                this.classList.toggle('is-empty', parsedState.item_count === 0);
                const cartDrawerWrapper = document.querySelector('cart-drawer');
                const cartFooter = document.getElementById('main-cart-footer');

                if (cartFooter) cartFooter.classList.toggle('is-empty', parsedState.item_count === 0);
                if (cartDrawerWrapper) cartDrawerWrapper.classList.toggle('is-empty', parsedState.item_count === 0);

                this.getSectionsToRender().forEach((section) => {
                  const elementToReplace =
                    document.getElementById(section.id).querySelector(section.selector) ||
                    document.getElementById(section.id);
                  elementToReplace.innerHTML = this.getSectionInnerHTML(
                    parsedState.sections[section.section],
                    section.selector
                  );
                });
                const updatedValue = parsedState.items[line - 1] ? parsedState.items[line - 1].quantity : undefined;
                let message = '';
                if (items.length === parsedState.items.length && updatedValue !== parseInt(quantityElement.value)) {
                  if (typeof updatedValue === 'undefined') {
                    message = window.cartStrings.error;
                  } else {
                    message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
                  }
                }
                this.updateLiveRegions(line, message);

                const lineItem =
                  document.getElementById(`CartItem-${line}`) || document.getElementById(`CartDrawer-Item-${line}`);
                if (lineItem && lineItem.querySelector(`[name="${name}"]`)) {
                  cartDrawerWrapper
                    ? trapFocus(cartDrawerWrapper, lineItem.querySelector(`[name="${name}"]`))
                    : lineItem.querySelector(`[name="${name}"]`).focus();
                } else if (parsedState.item_count === 0 && cartDrawerWrapper) {
                  trapFocus(cartDrawerWrapper.querySelector('.drawer__inner-empty'), cartDrawerWrapper.querySelector('a'));
                } else if (document.querySelector('.cart-item') && cartDrawerWrapper) {
                  trapFocus(cartDrawerWrapper, document.querySelector('.cart-item__name'));
                }
              });

              publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-items', cartData: parsedState, variantId: variantId });
              
                const price = parsedState.total_price;
                const FREE_GIFT_VARIANT_ID = document.querySelector('body').dataset.freeProduct;
                const hasFreeGift = parsedState.items.some(item => item.variant_id == FREE_GIFT_VARIANT_ID);
                // console.log(price,"price")
                // console.log(FREE_GIFT_VARIANT_ID,"FREE_GIFT_VARIANT_ID")
                // console.log(hasFreeGift,"hasFreeGift")
                productFormElement.addFreeGift(price , hasFreeGift);


                const ItemCount = parsedState.item_count;
                const shipId = $('.shipping-protection-checkbox').data('shipping-protection-id');
                // console.log(shipId,"shipId");
                const hasShipData = parsedState.items.some(item => item.variant_id == shipId);
                // console.log(hasShipData,"hasShipData1");
                if(hasFreeGift) return;
                if (!shipId) return;
                productFormElement.shippingProtection(hasShipData, ItemCount);
                productFormElement.CartTimer(true);        

                
            })
            .catch(() => {
              this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));
              const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
              errors.textContent = window.cartStrings.error;
            })
            .finally(() => {
              // this.disableLoading(line);
            });
        }

        updateLiveRegions(line, message) {
          const lineItemError =
            document.getElementById(`Line-item-error-${line}`) || document.getElementById(`CartDrawer-LineItemError-${line}`);
          if (lineItemError) lineItemError.querySelector('.cart-item__error-text').textContent = message;

          this.lineItemStatusElement.setAttribute('aria-hidden', true);

          const cartStatus =
            document.getElementById('cart-live-region-text') || document.getElementById('CartDrawer-LiveRegionText');
          cartStatus.setAttribute('aria-hidden', false);

          setTimeout(() => {
            cartStatus.setAttribute('aria-hidden', true);
          }, 1000);
        }

        getSectionInnerHTML(html, selector) {
          return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
        }

        enableLoading(line) {
          const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
          mainCartItems.classList.add('cart__items--disabled');

          const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
          const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

          [...cartItemElements, ...cartDrawerItemElements].forEach((overlay) => overlay.classList.remove('hidden'));

          document.activeElement.blur();
          this.lineItemStatusElement.setAttribute('aria-hidden', false);
        }

        disableLoading(line) {
          const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
          mainCartItems.classList.remove('cart__items--disabled');

          const cartItemElements = this.querySelectorAll(`#CartItem-${line} .loading__spinner`);
          const cartDrawerItemElements = this.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`);

          cartItemElements.forEach((overlay) => overlay.classList.add('hidden'));
          cartDrawerItemElements.forEach((overlay) => overlay.classList.add('hidden'));
        }
      }

      customElements.define('cart-items', CartItems);

      if (!customElements.get('cart-note')) {
        customElements.define(
          'cart-note',
          class CartNote extends HTMLElement {
            constructor() {
              super();

              this.addEventListener(
                'input',
                debounce((event) => {
                  const body = JSON.stringify({ note: event.target.value });
                  fetch(`${routes.cart_update_url}`, { ...fetchConfig(), ...{ body } }).then(() =>
                    CartPerformance.measureFromEvent('note-update:user-action', event)
                  );
                }, ON_CHANGE_DEBOUNCE_TIMER)
              );
            }
          }
        );
      }
  }
