export function addFreeGift(price, hasFreeGift, cart) {

  const FREE_GIFT_VARIANT_ID = document.querySelector('body').dataset.freeProduct;
  const cartTotal = price / 100;
  const THRESHOLD_AMOUNT = document.querySelector('body').dataset.freeProductPrice;

  if (!FREE_GIFT_VARIANT_ID) return;

  if (cartTotal >= THRESHOLD_AMOUNT && !hasFreeGift) {

    fetch(routes.cart_add_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id: FREE_GIFT_VARIANT_ID,
        quantity: 1,
        sections: ['cart-drawer','main-cart-items']
      })
    })
    .then(res => res.json())
    .then(data => {
      cart.renderContents(data);
    });

  } 
  else if (cartTotal < THRESHOLD_AMOUNT && hasFreeGift) {

    fetch(routes.cart_update_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        updates: {
          [FREE_GIFT_VARIANT_ID]: 0
        },
        sections: ['cart-drawer','main-cart-items']
      })
    })
    .then(res => res.json())
    .then(data => {
      cart.renderContents(data);
    });

  }
}