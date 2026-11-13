// BRIGHTFIELD tech cards: cool real / sci-fi / solarpunk names + a short kid-followable explanation.
// name: what the card calls it. line: what it is (real or fictional). town: what it changes in YOUR town.
// Runs in the browser (window.TECHS) and Node (require) so tests can check every card exists.
(function (root) {
  'use strict';
  const T = {
    power: {
      0: { name: 'Coal Plant', line: 'Burns coal (black rocks dug from the ground) to make electricity, and lots of smoke.', town: 'Gives power to factories. Homes next door cough from the smoke.' },
      1: { name: 'Gas Turbine', line: 'Burns natural gas. Cleaner than coal, but still some smoke.', town: 'Less smoke than coal. Homes still don\u2019t want it next door.' },
      2: { name: 'Wind Turbines', line: 'Giant windmills. Wind spins the blades and that spinning makes electricity.', town: 'No smoke at all! They love open meadows and fields, but whoosh too loudly for homes.' },
      leaf: { name: 'Agrivoltaic Fields', line: 'Solar panels with crops growing underneath. The plants get shade; the panels make electricity from the sun.', town: 'Cleans the air. Quiet enough that homes like having it next door.' },
      star: { name: 'Fusion Collectors', line: 'Squeeze atoms together the same way the sun does, making clean power with no smoke.', town: 'Cleans the air, and it\u2019s quiet, so homes like it next door.' },
    },
    move: {
      0: { name: 'Horse Stable', line: 'Before cars, people rode horses and pulled carts with them.', town: 'Homes like a ride nearby. A little dusty and smelly.' },
      1: { name: 'Motor Garage', line: 'Cars with petrol engines that puff smoke out of a pipe at the back.', town: 'Faster rides, but more smoke than the horses!' },
      2: { name: 'Charging Hub', line: 'Electric cars plug in here, like charging a tablet, and drive with no smoke.', town: 'No more smoke from rides.' },
      leaf: { name: 'Garden Tram', line: 'A street train that carries lots of people, with plants growing on its roof.', town: 'Cleans the air. It has a garden growing on its roof.' },
      star: { name: 'Maglev Express', line: 'Magnets lift the train so it floats above the track and zooms.', town: 'Cleans the air and zooms people around town.' },
    },
    food: {
      0: { name: 'Tractor Farm', line: 'A big field where a smoky tractor ploughs and plants the crops.', town: 'Makes food but puffs smoke. Flies from a dump next door bug the crops.' },
      1: { name: 'Orchard', line: 'Rows of fruit trees. People climb ladders to pick the apples.', town: 'Less smoke. Homes now love fresh fruit right outside the window.' },
      2: { name: 'Glasshouse', line: 'A glass building that keeps plants warm so food grows even in winter.', town: 'No smoke. Farms love compost from the compost yard.' },
      leaf: { name: 'Food Forest', line: 'A forest where almost every plant is food: nut trees, berry bushes and herbs.', town: 'Cleans the air and feeds the bees.' },
      star: { name: 'Aeroponic Stack', line: 'Crops grow on tall shelves indoors, misted with water and lit by lamps instead of sun.', town: 'Cleans the air and grows lots of food in a small space.' },
    },
    water: {
      0: { name: 'Deep Well', line: 'A deep hole in the ground. You lower a bucket on a rope to pull up water.', town: 'Plants and animals like water nearby.' },
      1: { name: 'Water Tower', line: 'A big tank up high. Water flows down the pipes by itself to every tap.', town: 'No smoke from water any more.' },
      2: { name: 'Rain Garden', line: 'A low garden that soaks up rain so streets don\u2019t flood and the water stays clean.', town: 'Clean water for crops and animals.' },
      leaf: { name: 'Living Wetland', line: 'A marshy pond with reeds. The plants clean the water and ducks live there.', town: 'Cleans the air. Animals come to drink and swim.' },
      star: { name: 'Kelp Bioreactors', line: 'Tanks of kelp (seaweed) that filter salt and muck out of seawater so people can drink it.', town: 'Cleans the air and gives the town lots of fresh drinking water from the sea.' },
    },
    home: {
      0: { name: 'Chimney Cottage', line: 'A little house heated by burning wood or coal in a fireplace.', town: 'Puffs chimney smoke. Likes parks, rides and good neighbours.' },
      1: { name: 'Terrace Houses', line: 'Houses joined side by side in a row, so they keep each other warm.', town: 'Less smoke than the cottages.' },
      2: { name: 'Living-Roof Flats', line: 'Apartments stacked high with gardens on the roof and on the balconies.', town: 'No smoke from homes any more.' },
      leaf: { name: 'Canopy Village', line: 'Homes built in and around big trees, joined by bridges.', town: 'Cleans the air. Every window looks out on leaves.' },
      star: { name: 'Arcology Spire', line: 'One giant living tower where thousands of people live, with gardens on every floor.', town: 'Cleans the air and fits lots of families in a small space.' },
    },
    make: {
      0: { name: 'Smokestack Mill', line: 'A factory with tall chimneys that puff smoke while machines make things.', town: 'Makes lots of smoke. Homes don\u2019t want it next door.' },
      1: { name: 'Workshop', line: 'A smaller place where people build and fix things with tools.', town: 'Less smoke. Homes don\u2019t mind it any more. Loves recycled stuff.' },
      2: { name: 'Robot Foundry', line: 'Robot arms help people build things carefully and quickly.', town: 'No smoke at all.' },
      leaf: { name: 'Repair Guild', line: 'Bring broken toys and bikes here; neighbours help you fix them instead of throwing them away.', town: 'Cleans the air. Less stuff ends up in the trash.' },
      star: { name: 'Nanoforge', line: 'Tiny robots you can\u2019t see build new things one atom at a time.', town: 'Cleans the air and makes things without waste.' },
    },
    waste: {
      0: { name: 'Landfill', line: 'A big pile where all the trash goes. It smells and attracts flies.', town: 'Homes hate the smell. Farms hate the flies.' },
      1: { name: 'Recycling Depot', line: 'Old cans, bottles and paper get sorted so they can be made into new things.', town: 'No more smell or flies. Workshops love the recycled metal.' },
      2: { name: 'Compost Yard', line: 'Food scraps and leaves rot into rich soil called compost.', town: 'No smoke. Farms LOVE compost: it helps food grow.' },
      leaf: { name: 'Mycelium Grid', line: 'A living web of mushroom roots that eats scraps and turns them into soil.', town: 'Cleans the air. Farms still love the compost.' },
      star: { name: 'Matter Reclaimer', line: 'Breaks old things down into tiny bits and builds brand-new things from them.', town: 'Cleans the air. Nothing gets thrown away.' },
    },
    wild: {
      0: { name: 'Meadow', line: 'A patch of grass with a few small trees. Wild land where animals can live.', town: 'Homes like nature next door. Animals visit when the air is clean.' },
      1: { name: 'City Park', line: 'Grass, trees, flowers and a bench, for people and animals to share.', town: 'Cleans more smoke. Butterflies may visit.' },
      2: { name: 'Old Growth', line: 'Lots of trees growing together. Trees breathe in smoke and breathe out fresh air.', town: 'Cleans even more smoke. Foxes and deer may come.' },
      leaf: { name: 'Wildflower Expanse', line: 'A field full of wild flowers that bees and butterflies love.', town: 'Cleans lots of smoke. A home for many animals.' },
      star: { name: 'Biosphere Dome', line: 'A giant glass bubble full of plants, with perfect weather inside.', town: 'Cleans lots of smoke. Plants grow all year round.' },
    },
  };
  function tech(axis, era, variant) { const k = era === 3 ? variant || 'leaf' : era; return T[axis][k]; }
  const TECHS = { T, tech };
  if (typeof module !== 'undefined' && module.exports) module.exports = TECHS;
  else root.TECHS = TECHS;
})(typeof window !== 'undefined' ? window : globalThis);
