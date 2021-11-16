import {
  defineComponent,
  onMounted,
  ref,
  reactive,
  provide,
  computed,
  watchEffect,
  h,
  watch,
} from 'vue';

import { defaultConfigs } from '@/partials/defaults';
import counterFactory, { Counter } from '@/partials/counter';
import {
  debounce,
  throttle,
  getSlides,
  getCurrentSlideIndex,
  getMaxSlideIndex,
  getMinSlideIndex,
} from '@/partials/utils';

import {
  Data,
  SetupContext,
  CarouselConfig,
  Ref,
  CarouselNav,
  ElementStyleObject,
  Breakpoints,
} from '@/types';

export default defineComponent({
  name: 'Carousel',
  props: {
    // count of items to showed per view
    itemsToShow: {
      default: defaultConfigs.itemsToShow,
      type: Number,
    },
    // count of items to be scrolled
    itemsToScroll: {
      default: defaultConfigs.itemsToScroll,
      type: Number,
    },
    // control infinite scrolling mode
    wrapAround: {
      default: defaultConfigs.wrapAround,
      type: Boolean,
    },
    // control infinite scrolling mode
    directionRight: {
      default: defaultConfigs.directionRight,
      type: Boolean,
    },
    // control snap position alignment
    snapAlign: {
      default: defaultConfigs.snapAlign,
      validator(value: string) {
        // The value must match one of these strings
        return ['start', 'end', 'center', 'center-even', 'center-odd'].includes(value);
      },
    },
    // sliding transition time in ms
    transition: {
      default: defaultConfigs.transition,
      type: Number,
    },
    // an object to store breakpoints
    breakpoints: {
      default: defaultConfigs.breakpoints,
      type: Object,
    },
    // time to auto advance slides in ms
    autoplay: {
      default: defaultConfigs.autoplay,
      type: Number,
    },
    // pause autoplay when mouse hover over the carousel
    pauseAutoplayOnHover: {
      default: defaultConfigs.pauseAutoplayOnHover,
      type: Boolean,
    },
    // slide number number of initial slide
    modelValue: {
      default: undefined,
      type: Number,
    },
    // toggle mouse dragging.
    mouseDrag: {
      default: defaultConfigs.mouseDrag,
      type: Boolean,
    },
    // toggle mouse dragging.
    touchDrag: {
      default: defaultConfigs.touchDrag,
      type: Boolean,
    },
    // an object to pass all settings
    settings: {
      default() {
        return {};
      },
      type: Object,
    },
  },
  setup(props: Data, { slots, emit }: SetupContext) {
    const root: Ref<Element | null> = ref(null);
    const slides: Ref<any> = ref([]);
    const slidesBuffer: Ref<Array<number>> = ref([]);
    const slideWidth: Ref<number> = ref(0);
    const slidesCount: Ref<number> = ref(1);
    const slidesCounter: Counter = counterFactory();

    let breakpoints: Ref<Breakpoints> = ref({});

    // generate carousel configs
    let defaultConfig: CarouselConfig = { ...defaultConfigs };
    // current config
    const config = reactive<CarouselConfig>({ ...defaultConfigs });

    // Update the carousel on props change
    watch(props, () => {
      initDefaultConfigs();
      updateBreakpointsConfigs();
      updateSlidesData();
      updateSlideWidth();
    });

    // slides
    const currentSlideIndex = ref(config.modelValue ?? 0);
    const prevSlideIndex = ref(0);
    const middleSlideIndex = ref(0);
    const maxSlideIndex = ref(0);
    const minSlideIndex = ref(0);

    provide('config', config);
    provide('slidesBuffer', slidesBuffer);
    provide('slidesCount', slidesCount);
    provide('currentSlide', currentSlideIndex);
    provide('maxSlide', maxSlideIndex);
    provide('minSlide', minSlideIndex);
    provide('slidesCounter', slidesCounter);

    /**
     * Configs
     */
    function initDefaultConfigs(): void {
      // generate carousel configs
      const mergedConfigs: CarouselConfig = {
        ...props,
        ...(props.settings as CarouselConfig),
      };

      // Set breakpoints
      breakpoints = ref({ ...mergedConfigs.breakpoints });

      // remove extra values
      defaultConfig = { ...mergedConfigs, settings: undefined, breakpoints: undefined };
    }

    function updateBreakpointsConfigs(): void {
      const breakpointsArray: number[] = Object.keys(breakpoints.value)
        .map((key: string): number => Number(key))
        .sort((a: number, b: number) => +b - +a);
      let newConfig = { ...defaultConfig };

      breakpointsArray.some((breakpoint): boolean => {
        const isMatched = window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
        if (isMatched) {
          newConfig = {
            ...newConfig,
            ...(breakpoints.value[breakpoint] as CarouselConfig),
          };
          return true;
        }
        return false;
      });
      let key: keyof CarouselConfig;
      for (key in newConfig) {
        // @ts-ignore
        config[key] = newConfig[key];
      }
    }

    const handleWindowResize = debounce(() => {
      if (breakpoints.value) {
        updateBreakpointsConfigs();
        updateSlidesData();
      }
      updateSlideWidth();
    }, 16);

    /**
     * Setup functions
     */

    function updateSlideWidth(): void {
      if (!root.value) return;
      const rect = root.value.getBoundingClientRect();
      slideWidth.value = rect.width / config.itemsToShow;
    }

    function updateSlidesData(): void {
      slidesCount.value = slides.value.length;
      if (slidesCount.value <= 0) return;

      middleSlideIndex.value = Math.ceil((slidesCount.value - 1) / 2);
      maxSlideIndex.value = getMaxSlideIndex(config, slidesCount.value);
      minSlideIndex.value = getMinSlideIndex(config);
      currentSlideIndex.value = getCurrentSlideIndex(
        config,
        currentSlideIndex.value,
        maxSlideIndex.value,
        minSlideIndex.value,
      );
    }

    function updateSlidesBuffer(): void {
      const slidesArray = [...Array(slidesCount.value).keys()];
      const shouldShiftSlides =
        config.wrapAround && config.itemsToShow + 1 <= slidesCount.value;

      if (shouldShiftSlides) {
        const buffer = Math.round((slidesCount.value - config.itemsToShow) / 2);
        let shifts = buffer - currentSlideIndex.value;

        if (config.snapAlign === 'end') {
          shifts += Math.floor(config.itemsToShow - 1);
        } else if (config.snapAlign === 'center' || config.snapAlign === 'center-odd') {
          shifts++;
        }

        // Check shifting directions
        if (shifts < 0) {
          for (let i = shifts; i < 0; i++) {
            slidesArray.push(Number(slidesArray.shift()));
          }
        } else {
          for (let i = 0; i < shifts; i++) {
            slidesArray.unshift(Number(slidesArray.pop()));
          }
        }
      }
      slidesBuffer.value = slidesArray;
    }

    onMounted((): void => {
      if (breakpoints.value) {
        updateBreakpointsConfigs();
        updateSlidesData();
      }
      updateSlideWidth();

      if (config.autoplay && config.autoplay > 0) {
        initializeAutoplay();
      }

      window.addEventListener('resize', handleWindowResize, { passive: true });
    });

    /**
     * Carousel Event listeners
     */
    let isTouch = false;
    const startPosition = { x: 0, y: 0 };
    const endPosition = { x: 0, y: 0 };
    const dragged = reactive({ x: 0, y: 0 });
    const isDragging = ref(false);
    const isHover = ref(false);

    const handleMouseEnter = (): void => {
      isHover.value = true;
    };
    const handleMouseLeave = (): void => {
      isHover.value = false;
    };

    const handleDrag = throttle((event: MouseEvent & TouchEvent): void => {
      if (!isTouch) event.preventDefault();

      endPosition.x = isTouch ? event.touches[0].clientX : event.clientX;
      endPosition.y = isTouch ? event.touches[0].clientY : event.clientY;
      const deltaX = endPosition.x - startPosition.x;
      const deltaY = endPosition.y - startPosition.y;

      dragged.y = deltaY;
      dragged.x = deltaX;
    }, 16);

    function handleDragStart(event: MouseEvent & TouchEvent): void {
      if (!isTouch) event.preventDefault();

      isTouch = event.type === 'touchstart';
      if ((!isTouch && event.button !== 0) || isSliding.value) {
        return;
      }

      isDragging.value = true;
      startPosition.x = isTouch ? event.touches[0].clientX : event.clientX;
      startPosition.y = isTouch ? event.touches[0].clientY : event.clientY;

      document.addEventListener(isTouch ? 'touchmove' : 'mousemove', handleDrag);
      document.addEventListener(isTouch ? 'touchend' : 'mouseup', handleDragEnd);
    }

    function handleDragEnd(): void {
      isDragging.value = false;

      const tolerance = Math.sign(dragged.x) * 0.4;
      const draggedSlides = Math.round(dragged.x / slideWidth.value + tolerance);

      let newSlide = getCurrentSlideIndex(
        config,
        currentSlideIndex.value - draggedSlides,
        maxSlideIndex.value,
        minSlideIndex.value,
      );
      slideTo(newSlide);

      dragged.x = 0;
      dragged.y = 0;

      document.removeEventListener(isTouch ? 'touchmove' : 'mousemove', handleDrag);
      document.removeEventListener(isTouch ? 'touchend' : 'mouseup', handleDragEnd);
    }

    /**
     * Autoplay
     */
    function initializeAutoplay(): void {
      setInterval(() => {
        if (config.pauseAutoplayOnHover && isHover.value) {
          return;
        }

        next();
      }, config.autoplay);
    }

    /**
     * Navigation function
     */
    const isSliding = ref(false);

    function slideTo(slideIndex: number, mute = false): void {
      if (currentSlideIndex.value === slideIndex || isSliding.value) {
        return;
      }

      // Wrap slide index
      const lastSlideIndex = slidesCount.value - 1;
      if (slideIndex > lastSlideIndex) {
        return slideTo(slideIndex - slidesCount.value);
      }
      if (slideIndex < 0) {
        return slideTo(slideIndex + slidesCount.value);
      }

      isSliding.value = true;
      prevSlideIndex.value = currentSlideIndex.value;
      currentSlideIndex.value = slideIndex;

      if (!mute) {
        emit('update:modelValue', currentSlideIndex.value);
      }
      setTimeout((): void => {
        if (config.wrapAround) updateSlidesBuffer();
        isSliding.value = false;
      }, config.transition);
    }

    function next(): void {
      if (config.directionRight) {
        let prevSlide = currentSlideIndex.value - config.itemsToScroll;
        if (!config.wrapAround) {
          prevSlide = Math.max(prevSlide, minSlideIndex.value);
        }
        slideTo(prevSlide);
      } else {
        let nextSlide = currentSlideIndex.value + config.itemsToScroll;
        if (!config.wrapAround) {
          nextSlide = Math.min(nextSlide, maxSlideIndex.value);
        }
        slideTo(nextSlide);
      }
    }

    function prev(): void {
      if (config.directionRight) {
        let nextSlide = currentSlideIndex.value + config.itemsToScroll;
        if (!config.wrapAround) {
          nextSlide = Math.min(nextSlide, maxSlideIndex.value);
        }
        slideTo(nextSlide);
      } else {
        let prevSlide = currentSlideIndex.value - config.itemsToScroll;
        if (!config.wrapAround) {
          prevSlide = Math.max(prevSlide, minSlideIndex.value);
        }
        slideTo(prevSlide);
      }
    }

    const nav: CarouselNav = { slideTo, next, prev };
    provide('nav', nav);

    /**
     * Track style
     */
    const slidesToScroll = computed((): number => {
      let output = slidesBuffer.value.indexOf(currentSlideIndex.value);
      if (config.snapAlign === 'center' || config.snapAlign === 'center-odd') {
        output -= (config.itemsToShow - 1) / 2;
      } else if (config.snapAlign === 'center-even') {
        output -= (config.itemsToShow - 2) / 2;
      } else if (config.snapAlign === 'end') {
        output -= config.itemsToShow - 1;
      }

      if (!config.wrapAround) {
        const max = slidesCount.value - config.itemsToShow;
        const min = 0;
        output = Math.max(Math.min(output, max), min);
      }
      return output;
    });
    provide('slidesToScroll', slidesToScroll);

    const trackStyle = computed((): ElementStyleObject => {
      const xScroll = dragged.x - slidesToScroll.value * slideWidth.value;
      return {
        transform: `translateX(${xScroll}px)`,
        transition: `${isSliding.value ? config.transition : 0}ms`,
      };
    });

    const slotsProps = reactive({
      slideWidth,
      slidesCount,
      currentSlide: currentSlideIndex,
    });
    const slotSlides = slots.default || slots.slides;
    const slotAddons = slots.addons;

    watchEffect((): void => {
      // Handel when slides added/removed
      const needToUpdate = slidesCount.value !== slides.value.length;
      const currentSlideUpdated =
        props.modelValue !== undefined && currentSlideIndex.value !== props.modelValue;

      if (currentSlideUpdated) {
        slideTo(Number(props.modelValue), true);
      }

      if (needToUpdate) {
        updateSlidesData();
        updateSlidesBuffer();
      }
      if (slidesCounter.read) {
        slidesCounter.value = slides.value.length - 1;
      }
    });

    initDefaultConfigs();
    updateBreakpointsConfigs();
    updateSlidesBuffer();

    return () => {
      const slidesElements = getSlides(slotSlides?.(slotsProps));
      const addonsElements = slotAddons?.(slotsProps) || [];
      slides.value = slidesElements;
      // Bind slide order
      slidesElements.forEach(
        (el: { props: { [key: string]: any } }, index: number) => (el.props.index = index),
      );
      const trackEl = h(
        'ol',
        {
          class: 'carousel__track',
          style: trackStyle.value,
          onMousedown: config.mouseDrag ? handleDragStart : null,
          onTouchstart: config.touchDrag ? handleDragStart : null,
        },
        slidesElements,
      );
      const viewPortEl = h('div', { class: 'carousel__viewport' }, trackEl);

      return h(
        'section',
        {
          ref: root,
          class: 'carousel',
          'aria-label': 'Gallery',
          onMouseenter: handleMouseEnter,
          onMouseleave: handleMouseLeave,
        },
        [viewPortEl, addonsElements],
      );
    };
  },
});
