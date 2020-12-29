// This software is free for commercial and non-commercial use,
// so long as it is used for the good of humanity.
// There are no warranties, expressed or implied, except that
// I can personally guarantee that this code has bugs.

// Completion list:
// (DONE) 1. Indicate how many days in the cohort
// (DONE) 2. 100x speedup with bump lists (currently 2.5 sec)
// 3. Display results in a nice panel
// 4. click do download complete CSV
// 5. click to see cohort details
// 6. quick-graph at each setting?
// 7. speed-test shuffled index lists with typed arrays

var QUEUE_SHIFT       = 0;
var QUEUE_SHIFT_SHARE = 1;
var QUEUE_SWAP        = 2;

// Each Person occupies one vaccination slot in a Cohort.
function Person(original_slot)
{
    this.original_slot = original_slot;
    this.current_slot = original_slot;
    this.amount_spent = 0;
    this.amount_received = 0;

    // Give this person a name, and some money, and some prefernces
    this.set_identity = function()
    {
        var initials = 'ABCDEFGHIJKLMNPQRSTUVWXYZ';
        var firstname_index = int_in_range_inclusive(0, list_of_names.length - 1);
        var lastname_index = int_in_range_inclusive(0, initials.length - 1);
        this.name = list_of_names[firstname_index] + ' ' + initials[lastname_index];
        this.total_available_cash_savings = make_random_savings(); // How much money the person could possibly spend
        this.choose_to_flex = false;
        this.choose_to_jump = false;
        this.i_want_the_vaccine_sooner = Math.random(); // 1.0 = "want it ASAP" and 0.0 = "don't care when."
        this.i_want_extra_money = Math.random(); // 1.0 = "I'm dangerously broke" and 0.0 = "I'm fine for money."
    }

    // Ask this person if they want to be flexible.
    this.ask_about_flex = function()
    {
        if (this.i_want_extra_money > this.i_want_the_vaccine_sooner)
        {
            if (this.i_want_extra_money > 0.25) // check the "bump me" box
                this.choose_to_flex = true;
        }
    }

    // Let this person shop for an earlier vaccination date.
    this.ask_about_jump = function(cohort)
    {
        if (this.choose_to_flex)
            return;
        if (this.i_want_the_vaccine_sooner > this.i_want_extra_money)
        {
            this.minimum_days_to_jump = 2;  // I won't pay to jump less than this many days.
            var percent_of_my_savings_im_willing_to_spend = 20 * this.i_want_the_vaccine_sooner;
            this.amount_im_willing_to_spend = this.total_available_cash_savings * 0.01 * percent_of_my_savings_im_willing_to_spend;
            var budget = this.amount_im_willing_to_spend - this.amount_spent;

            // Given my budget, how many slots could I jump ahead?
            var max_slots_i_can_jump = Math.floor(this.amount_im_willing_to_spend / cohort.bump_price);
            if (max_slots_i_can_jump > this.current_slot)
                max_slots_i_can_jump = this.current_slot;
            if (max_slots_i_can_jump >= this.minimum_days_to_jump * cohort.doses_per_day)
            {
                // I can afford to jump ahead by some good amount, so give it a shot.
                this.choose_to_jump = true;
                var link = this.bump_link;
                var min_slot = this.current_slot - max_slots_i_can_jump;
                // find the first flex with an earlier slot
                while (link != null && link.current_slot > this.current_slot)
                    link = link.bump_link;
                // Now go shopping!
                if (cohort.bump_method == QUEUE_SWAP)
                {
                    if (link != null && link.current_slot >= min_slot)
                    {
                        while (link.bump_link != null && link.bump_link.current_slot >= min_slot)
                            link = link.bump_link;
                        var link_slot = link.current_slot;
                        link.current_slot = this.current_slot;
                        this.current_slot = link_slot;
                        link = link.bump_link;
                    }
                }
                else
                {
                    // Now climb the chain until it gets too pricey.
                    while (link != null && link.current_slot >= min_slot)
                    {
                        var link_slot = link.current_slot;
                        link.current_slot = this.current_slot;
                        this.current_slot = link_slot;
                        link = link.bump_link;
                    }
                }
            }
        }
    }

    this.set_identity();
}

// A Cohort is a group of people signed up for vaccination.
// Within a Cohort, the initial order is arbitrary.
function Cohort(number_of_doses, doses_per_day, bump_price, bump_method)
{
    this.number_of_doses = number_of_doses;
    this.doses_per_day = doses_per_day;
    this.bump_price = bump_price;
    this.bump_method = bump_method;
    this.first_dose_date = days_after_today(30);
    this.people = []
    this.appointment_slots = []
    this.slot_day_indices = []
    this.slot_dates = []
    for (var slot = 0; slot < this.number_of_doses; ++slot)
    {
        var person = new Person(slot);
        this.people.push(person);
        this.appointment_slots.push(person);

        var slot_day_index = Math.floor(slot / this.doses_per_day);
        var slot_date = date = new Date(this.first_dose_date);
        slot_date.setDate(slot_date.getDate() + slot_day_index);
        this.slot_day_indices.push(slot_day_index);
        this.slot_dates.push(slot_date);
    }

    this.let_people_choose = function()
    {
        for (var i = 0; i < this.people.length; ++i)
            this.people[i].ask_about_flex();
        this.make_bump_chain();

        var shuffle = make_shuffle(this.people.length);
        for (var i = 0; i < shuffle.length; ++i)
            this.people[shuffle[i]].ask_about_jump(this);
        this.finish();
    }

    this.finish = function()
    {
        for (var i = 0; i < this.people.length; ++i)
        {
            var person = this.people[i];
            this.appointment_slots[person.current_slot] = person;
            var jump = person.original_slot - person.current_slot;
            if (jump > 0)
                person.amount_spent = jump * this.bump_price;
            else
                person.amount_received = -jump * this.bump_price;
        }
        if (this.bump_method == QUEUE_SHIFT_SHARE)
        {
            var total_spent = 0;
            var num_flexers = 0;
            for (var i = 0; i < this.people.length; ++i)
            {
                var person = this.people[i];
                total_spent += person.amount_spent;
                if (person.choose_to_flex)
                    num_flexers++;
            }
            if (num_flexers > 0)
            {
                var flex_payment = total_spent / num_flexers;
                for (var i = 0; i < this.people.length; ++i)
                {
                    var person = this.people[i];
                    if (person.choose_to_flex)
                        person.amount_received = flex_payment;
                }
            }
        }
    }

    this.make_bump_chain = function()
    {
        // Everyone's bump_link points to the previous flexible person
        // bump_chain is the start of the list.
        this.bump_chain = null;
        for (var i = 0; i < this.people.length; ++i)
        {
            var person = this.people[i];
            person.bump_link = this.bump_chain;
            if (person.choose_to_flex)
                this.bump_chain = person;
        }
    }

    // this.print_to_html_table = function()
    // {
    //     var out_str = '';
    //     out_str += '<table>\n';
    //     out_str += '<tr>';
    //     out_str += '<td>' + 'before' + '</td>';
    //     out_str += '<td>' + 'after' + '</td>';
    //     out_str += '<td>' + '+/- days' + '</td>';
    //     out_str += '<td>' + 'date' + '</td>';
    //     out_str += '<td>' + 'name' + '</td>';
    //     out_str += '<td>' + 'budget' + '</td>';
    //     out_str += '<td>' + 'spent' + '</td>';
    //     out_str += '<td>' + 'received' + '</td>';
    //     out_str += '</tr>\n';
    //     for (var slot = 0; slot < this.appointment_slots.length; ++slot)
    //     {
    //         out_str += '<tr>';
    //         var person = this.appointment_slots[slot];
    //         out_str += '<td>' + (person.original_slot + 1) + '</td>';
    //         out_str += '<td>' + (slot + 1) + '</td>';
    //         if (person.choose_to_jump || person.choose_to_flex)
    //             out_str += '<td>' + (this.slot_day_indices[person.original_slot] - this.slot_day_indices[person.current_slot]) + '</td>';
    //         else
    //             out_str += '<td>' + '-' + '</td>';
    //         out_str += '<td>' + date_to_string(this.slot_dates[slot]) + '</td>';
    //         out_str += '<td>' + person.name + '</td>';
    //         if (person.choose_to_jump)
    //             out_str += '<td>' + dollar_text(person.amount_im_willing_to_spend) + '</td>';
    //         else
    //             out_str += '<td>' + '-' + '</td>';
    //         out_str += '<td>' + dollar_text(person.amount_spent) + '</td>';
    //         if (person.choose_to_flex)
    //             out_str += '<td>' + dollar_text(person.amount_received) + '</td>';
    //         else
    //             out_str += '<td>' + '-' + '</td>';
    //         out_str += '</tr>\n';
    //     }
    //     out_str += '<table>\n';
    //     return out_str;
    // }

    this.print_to_csv_string = function()
    {
        var out_str = '';
        out_str += 'slot,actual-vacc-date,name,day-change,slot-change,money-paid,money-received\n';
        for (var slot = 0; slot < this.appointment_slots.length; ++slot)
        {
            var person = this.appointment_slots[slot];
            out_str += slot + ',';
            out_str += date_to_string(this.slot_dates[slot]) + ',';
            out_str += person.name + ',';
            if (person.current_slot == person.original_slot)
            {
                out_str += ',,';
            }
            else
            {
                out_str += (this.slot_day_indices[person.original_slot] - this.slot_day_indices[person.current_slot]) + ',';
                out_str += (person.original_slot - person.current_slot) + ',';
            }
            if (person.amount_spent > 0)
            {
                out_str += '$' + person.amount_spent;
            }
            out_str += ',';
            if (person.amount_received > 0)
            {
                out_str += '$' + person.amount_received;
            }
            out_str += '\n';
        }
        return out_str;
    }
}

// MultiRunData is the collector, averager, and reporter
// used to combine the results of 1 or more Cohorts.
function MultiRunData()
{
    this.initialized = false;

    this.initialize = function(cohort)
    {
        this.initialized = true;
        this.bump_method = cohort.bump_method;
        this.bump_price = cohort.bump_price;
        this.num_slots = cohort.number_of_doses;
        this.num_slots_per_day = cohort.doses_per_day;
        this.num_days = Math.ceil(this.num_slots / this.num_slots_per_day);

        this.total_cohorts = 0;
        this.jump_slot_histogram = new Uint32Array(new ArrayBuffer(4 * this.num_slots));
        this.flex_slot_histogram = new Uint32Array(new ArrayBuffer(4 * this.num_slots));
        this.jump_days_histogram = new Uint32Array(new ArrayBuffer(4 * this.num_days));
        this.flex_days_histogram = new Uint32Array(new ArrayBuffer(4 * this.num_days));
        this.jump_count = 0;
        this.flex_count = 0;
        for (var i = 0; i < this.num_slots; ++i)
            this.jump_slot_histogram[i] = this.flex_slot_histogram[i] = this.jump_days_histogram[i] = this.flex_days_histogram[i] = 0;
    }

    this.accumulate = function(cohort)
    {
        if (!this.initialized)
            this.initialize(cohort);
        this.total_cohorts++;
        for (var p = 0; p < cohort.people.length; ++p)
        {
            var person = cohort.people[p];
            if (person.choose_to_jump)
            {
                this.jump_count++;
                var jump_slots = person.original_slot - person.current_slot;
                var jump_days = Math.floor(jump_slots / this.num_slots_per_day);
                this.jump_slot_histogram[jump_slots]++;
                this.jump_days_histogram[jump_days]++;
            }
            else if (person.choose_to_flex)
            {
                this.flex_count++;
                var flex_slots = person.current_slot - person.original_slot;
                var flex_days = Math.floor(flex_slots / this.num_slots_per_day);
               this.flex_slot_histogram[flex_slots]++;
               this.flex_days_histogram[flex_days]++;
            }
        }
    }

    // this.print_html_info_to_string = function()
    // {
    //     var total_people = this.total_cohorts * this.num_slots;
    //     var max_jump = 0;
    //     var max_flex = 0;
    //     var min_nz_jump = 0;
    //     var min_nz_flex = 0;
    //     var jump_power = 0;
    //     var flex_power = 0;
    //     var avg_nz_jump = 0;
    //     var avg_nz_flex = 0;
    //     var num_nz_jumpers = 0;
    //     var num_nz_flexers = 0;
    //     var num_jumpers = this.jump_slot_histogram[0];
    //     var num_flexers = this.flex_slot_histogram[0];
    //     for (var i = 1; i < this.jump_slot_histogram.length; ++i)
    //     {
    //         var jumpers = this.jump_slot_histogram[i];
    //         var flexers = this.flex_slot_histogram[i];
    //         num_jumpers += jumpers;
    //         num_flexers += flexers;
    //         num_nz_jumpers += jumpers;
    //         num_nz_flexers += flexers;
    //         jump_power += i * jumpers;
    //         flex_power += i * flexers;
    //         if (jumpers)
    //         {
    //             max_jump = i;
    //             if (min_nz_jump == 0)
    //                 min_nz_jump = i;
    //         }
    //         if (flexers)
    //         {
    //             max_flex = i;
    //             if (min_nz_flex == 0)
    //                 min_nz_flex = i;
    //         }
    //     }

    //     var sstr = '';
    //     sstr += '<b>' + (100 * num_jumpers / total_people).toFixed(0) + '%</b> of all participants chose to pay for an earlier vaccination.<br/>'
    //     sstr += 'Of those, <b>' + (100 * num_nz_jumpers / num_jumpers).toFixed(0) + '%</b> were able to.<br/>'
    //     sstr += 'Average payment made: ' + dollar_text(jump_power * this.bump_price / num_nz_jumpers) + '<br/>';
    //     sstr += 'Max payment made: ' + dollar_text(max_jump * this.bump_price) + '<br/>';
    //     sstr += 'Average days earlier: ' + (jump_power / (this.num_slots_per_day * num_nz_jumpers)).toFixed(0) + '<br/>';
    //     sstr += 'Max days earlier: ' + (max_jump / this.num_slots_per_day).toFixed(0) + '<br/>';
    //     sstr += '<br/>'
    //     sstr += '<b>' + (100 * num_flexers / total_people).toFixed(0) + '%</b> of all participants chose to let others go first, and possibly receive a check.<br/>'
    //     if (this.bump_method == QUEUE_SHIFT_SHARE)
    //     {
    //         sstr += 'Everyone who did this received a check for <b>' + dollar_text(flex_power * this.bump_price / num_flexers) + '</b> when they got vaccinated.<br/>';
    //     }
    //     else
    //     {
    //         sstr += 'Of those, <b>' + (100 * num_nz_flexers / num_flexers).toFixed(3) + '%</b> received a check.<br/>'
    //         sstr += 'Average check: ' + dollar_text(flex_power * this.bump_price / num_nz_flexers) + '<br/>';
    //         sstr += 'Biggest check: ' + dollar_text(max_flex * this.bump_price) + '<br/>';
    //         sstr += 'Smallest check: ' + dollar_text(min_nz_flex * this.bump_price) + '<br/>';
    //     }
    //     sstr += 'No one was delayed more than <b>' + (max_flex / this.num_slots_per_day).toFixed(0) + ' days</b><br/>';
    //     sstr += 'Average delay: ' + (flex_power / (num_flexers * this.num_slots_per_day)).toFixed(0) + ' days<br/>';
    //     return sstr;
    // }

    // this.print_svg_to_string_v1 = function()
    // {
    //     var max_jump = Math.max(...this.jump_days_histogram);
    //     var max_flex = Math.max(...this.flex_days_histogram);
    //     var max_jump_flex = Math.max(max_jump, max_flex);
    //     if (max_jump_flex == 0)
    //         return '';

    //     var view_left = 0;
    //     var view_width = 1000;
    //     var view_top = 0;
    //     var view_height = 1000;
    //     var sstr = '';
    //     sstr += "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\""
    //             + view_left + " " + view_top + " " + view_width + " " + view_height + "\" ";
    //     sstr += "xmlns:xlink=\"http://www.w3.org/1999/xlink\">\n";
    //     sstr += "<g>\n";

    //     var jump_color = 'rgb(233, 130, 68)';
    //     var flex_color = 'rgb(105, 154, 208)';
    //     var graph_top = 0.1 * view_height;
    //     var graph_bot = 0.9 * view_height;
    //     var graph_left = 0.1 * view_width;
    //     var graph_right = 0.9 * view_width;
    //     var graph_mid = 0.5 * view_width;
    //     var graph_width = graph_right - graph_left;
    //     var graph_height = graph_bot - graph_top;
    //     var axle_width = 0.002 * graph_width;
    //     var day_height = graph_height / (this.num_days + 1);
    //     var day_thick = 0.5 * day_height;
    //     var text_size = 0.5 * graph_top;
    //     var text_color = '#888';

    //     var jump_scale = 0.55 * graph_width / max_jump_flex;
    //     var flex_scale = 0.55 * graph_width / max_jump_flex;

    //     // draw the axle
    //     sstr += svg_box(graph_mid - 0.5 * axle_width, graph_top, axle_width, graph_height, '#888');
    //     for (var i = 0; i < this.num_days; ++i)
    //     {
    //         var day_y_notch = this.num_days - i - 1;
    //         var w = jump_scale * this.jump_days_histogram[i];
    //         var h = day_thick;
    //         var x = graph_mid - w;
    //         var y = graph_top + day_height * day_y_notch + day_thick;
    //         sstr += svg_box(x, y, w, h, jump_color);
    //         var flex = this.flex_days_histogram[i];
    //         w = flex_scale * flex;
    //         x = graph_mid;
    //         if (flex)
    //             max_flex_days = i;
    //         sstr += svg_box(x, y, w, h, flex_color);
    //     }
    //     // label the axes! (per https://xkcd.com/833/)
    //     // sstr += svg_text(''+this.jump_days_histogram.length+' days',
    //     //          graph_mid, graph_top - 0.2 * text_size, text_size, text_color, 'middle', 'baseline');

    //     // sstr += svg_text('max delay '+max_flex_days+' days',
    //     //          0.5 * (graph_mid + graph_right), graph_bot - (day_height * max_flex_days) - 0.2 * text_size, 0.5 * text_size, text_color, 'middle', 'baseline');

    //     sstr += "</g>\n";
    //     sstr += "</svg>\n";
    //     return sstr;
    // }

    this.print_svg_to_string_v2 = function()
    {
        var max_jump = Math.max(...this.jump_days_histogram);
        var max_flex = Math.max(...this.flex_days_histogram);
        var max_jump_flex = Math.max(max_jump, max_flex);
        if (max_jump_flex == 0)
            return '';

        var max_flex_days = 0;
        var max_jump_days = 0;
        for (var i = 0; i < this.num_days; ++i)
        {
            if (this.jump_days_histogram[i])
                max_jump_days = i;
            if (this.flex_days_histogram[i])
                max_flex_days = i;
        }
        var total_jump_dollars = 0;
        var total_jumpers = 0;
        var total_nz_jumpers = 0;
        var total_flex_peeps = 0;
        for (var i = 0; i < this.num_slots; ++i)
        {
            total_jumpers += this.jump_slot_histogram[i];
            if (i)
                total_nz_jumpers += this.jump_slot_histogram[i];
            total_jump_dollars += this.bump_price * i * this.jump_slot_histogram[i];
            total_flex_peeps += this.flex_slot_histogram[i];
        }
        var total_keep_peeps = (this.num_slots * this.total_cohorts) - (total_jumpers + total_flex_peeps);
        var flex_payment = total_jump_dollars / total_flex_peeps;
        var day_major = 10;
        if (max_jump_days + max_flex_days > 100)
            day_major = 25;
        if (max_jump_days + max_flex_days > 500)
            day_major = 50;
        var day_min = -day_major * Math.ceil(max_flex_days / day_major);
        var day_max =  day_major * Math.ceil(max_jump_days / day_major);
        if (day_max == 0)
            day_max = day_major;
        if (day_min == 0)
            day_min = -day_major;

        var view_left = 0;
        var view_width = 1000;
        var view_top = 0;
        var view_height = 1000;

        var margin = 0.02 * view_height;
        var jump_color = 'rgb(233, 130, 68)';
        var flex_color = 'rgb(105, 154, 208)';
        var graph_top = view_top + margin;
        var graph_bot = view_top + view_height - margin;
        var graph_left = view_left + margin;
        var graph_right = view_left + view_width - margin;
        var graph_mid = 0.5 * view_width;
        var graph_width = graph_right - graph_left;
        var graph_height = graph_bot - graph_top;
        var day_scale = graph_width / (day_max - day_min);
        if (day_scale > 20)
            day_scale = 20;
        var person_scale = 1000 / (this.num_slots * this.total_cohorts);
        if (person_scale * max_jump_flex > 300)
            person_scale = 300 / max_jump_flex;
        var day_thick = 0.5 * day_scale;
        var text_size = 16;
        var text_color = '#888';

        var zero_day_x = graph_left + day_scale * -day_min;

        var jump_scale = person_scale;
        var flex_scale = person_scale;
        var flex_axle_y = graph_top + max_flex * flex_scale;
        if (flex_axle_y < 10.5 * text_size) // make sure there's space for the text
            flex_axle_y = 10.5 * text_size;
        var jump_axle_y = flex_axle_y + 2.0 * text_size;

        graph_bot = jump_axle_y + max_jump * person_scale;
        graph_right = graph_left + day_scale * (day_max - day_min);
        view_height = graph_bot + margin;

        var sstr = '';
        sstr += "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\""
                + view_left + " " + view_top + " " + view_width + " " + view_height + "\" ";
        sstr += "xmlns:xlink=\"http://www.w3.org/1999/xlink\">\n";
        sstr += "<g>\n";

        // frame debug box
        if (0)
        {
            sstr += svg_line(graph_left, graph_top, graph_right, graph_top,  '#888', 1);
            sstr += svg_line(graph_left, graph_top, graph_left, graph_bot,   '#888', 1);
            sstr += svg_line(graph_left, graph_bot, graph_right, graph_bot,  '#888', 1);
            sstr += svg_line(graph_right, graph_top, graph_right, graph_bot, '#888', 1);
            sstr += svg_line(view_left, view_top, view_width, view_top, '#f00', 3);
            sstr += svg_line(view_left, view_height, view_width, view_height, '#f00', 3);
        }
        // draw the axle
        var gap = text_size * 0.1;
        var hmin = 0.9 * gap;
        sstr += svg_line(graph_left, flex_axle_y + gap, graph_right, flex_axle_y + gap, '#888', 1);
        sstr += svg_line(graph_left, jump_axle_y - gap, graph_right, jump_axle_y - gap, '#888', 1);
        sstr += svg_text('days early →', zero_day_x + 3 * day_scale, flex_axle_y, text_size, text_color, 'start', 'baseline', 'normal');
        sstr += svg_text('← days delayed', graph_left, jump_axle_y, text_size, text_color, 'start', 'hanging', 'normal');

        var fpeeps = Math.round(total_flex_peeps / this.total_cohorts);
        var jpeeps = Math.round(total_nz_jumpers / this.total_cohorts);
        var kpeeps = this.num_slots - (fpeeps + jpeeps);
        var msg_x = zero_day_x + 8 * text_size;
        var msg_y = graph_top;
        var msg_jump0 = ' ' + (100 * total_nz_jumpers / (this.num_slots * this.total_cohorts)).toFixed(2) + '% '
                        + '(' + comma_text(jpeeps) + ' people) chose to pay for an earlier date.';
        var msg_jump1 = 'Average was ' + dollar_text(total_jump_dollars / total_nz_jumpers) + ' for ' + (total_jump_dollars / (total_nz_jumpers * this.bump_price * this.num_slots_per_day)).toFixed(0) + ' days.';
        var msg_flex0 = ' ' + (100 * total_flex_peeps / (this.num_slots * this.total_cohorts)).toFixed(2) + '% '
                        + '(' + comma_text(fpeeps) + ' people) chose to be flexible, letting others go ahead.';
        var msg_flex1 = ' Each got a check for ' + dollar_text(flex_payment) + ' at vaccination time.';
        var msg_flex2 = ' No one was delayed more than ' + max_flex_days + ' days.';
        var msg_keep0 = ' ' + (100 * (total_keep_peeps) / (this.num_slots * this.total_cohorts)).toFixed(2) + '% '
                        + '(' + comma_text(kpeeps) + ' people) chose to keep their original date.';
        sstr += svg_text('Get it early:', msg_x - 0.25 * text_size, msg_y, text_size, jump_color, 'end', 'hanging', 'bolder');
        sstr += svg_text(msg_jump0, msg_x, msg_y, text_size, jump_color, 'start', 'hanging', 'normal');
        msg_y += text_size;
        sstr += svg_text(msg_jump1, msg_x, msg_y, text_size, jump_color, 'start', 'hanging', 'normal');
        msg_y += 1.5 * text_size;
        sstr += svg_text('I\'m flexible:', msg_x - 0.25 * text_size, msg_y, text_size, flex_color, 'end', 'hanging', 'bolder');
        sstr += svg_text(msg_flex0, msg_x, msg_y, text_size, flex_color, 'start', 'hanging', 'normal');
        msg_y += text_size;
        sstr += svg_text(msg_flex1, msg_x, msg_y, text_size, flex_color, 'start', 'hanging', 'normal');
        msg_y += text_size;
        sstr += svg_text(msg_flex2, msg_x, msg_y, text_size, flex_color, 'start', 'hanging', 'normal');
        msg_y += 1.5 * text_size;
        sstr += svg_text('Stay put:', msg_x - 0.25 * text_size, msg_y, text_size, '#aaa', 'end', 'hanging', 'bolder');
        sstr += svg_text(msg_keep0, msg_x, msg_y, text_size, '#aaa', 'start', 'hanging', 'normal');

        for (var i = 0; i < this.num_days; ++i)
        {
            var x = zero_day_x + day_scale * i - 0.5 * day_thick;
            var w = day_thick;
            var ttxj = zero_day_x + day_scale * i - 0.5 * day_scale;
            var ttxf = zero_day_x - day_scale * i - 0.5 * day_scale;
            var ttw = day_scale;
            var txt_days = (i == 1) ? 'day' : 'days';
            var tooltip = '';
            if (this.jump_days_histogram[i])
            {
                var peep_count = comma_text(this.jump_days_histogram[i] / this.total_cohorts);
                if (peep_count == 0)
                    peep_count = 1;
                var txt_peep = (peep_count == 1) ? 'person' : 'people';
                if (i)
                {
                    tooltip = '' + (100 * this.jump_days_histogram[i] / (this.num_slots * this.total_cohorts)).toFixed(2) + '% '
                          + '(' + peep_count + ' ' + txt_peep + ')'
                          + ' paid about ' + dollar_text((i - 0.5) * this.bump_price * this.num_slots_per_day)
                          + ' to get vaccinated ' + i + ' ' + txt_days + ' earlier.';
                }
                else
                {
                    tooltip = '' + (100 * this.jump_days_histogram[i] / (this.num_slots * this.total_cohorts)).toFixed(2) + '% '
                          + '(' + peep_count + ' people)'
                          + ' wanted to pay to get vaccinated early, but could not find a slot to fit their budget.';
                }
                var h = jump_scale * this.jump_days_histogram[i];
                if (h < hmin)
                    h = hmin;
                var y = jump_axle_y;
                sstr += svg_box(x, y, w, h, jump_color, '#000', 0, 0, 1, 1, null);
                // tooltip region is bigger
                sstr += svg_box(ttxj, jump_axle_y, ttw, graph_bot - jump_axle_y, '#f00', '#000', 0, 0, 0, 1, tooltip);
            }
            if (this.flex_days_histogram[i])
            {
                var flex = this.flex_days_histogram[i];
                var peep_count = comma_text(flex / this.total_cohorts);
                if (peep_count == 0)
                    peep_count = 1;
                var txt_peep = (peep_count == 1) ? 'person' : 'people';
                if (i)
                {
                    tooltip = '' + (100 * flex / (this.num_slots * this.total_cohorts)).toFixed(2) + '% '
                          + '(' + peep_count + ' ' + txt_peep + ')'
                          + ' received ' + dollar_text(flex_payment)
                          + ' for a delay of ' + i + ' ' + txt_days + '.';
                }
                else
                {
                    tooltip = '' + (100 * flex / (this.num_slots * this.total_cohorts)).toFixed(2) + '% '
                          + '(' + peep_count + ' ' + txt_peep + ')'
                          + ' received ' + dollar_text(flex_payment)
                          + ' without being delayed at all.';
                }
                h = flex_scale * flex;
                y = flex_axle_y - h;
                if (h < hmin)
                    h = hmin;
                var x = zero_day_x - day_scale * i - 0.5 * day_thick;
                sstr += svg_box(x, y, w, h, flex_color, '#000', 0, 0, 1, 1, null);
                // tooltip region is bigger
                sstr += svg_box(ttxf, graph_top, ttw, flex_axle_y - graph_top, '#f00', '#000', 0, 0, 0, 1, tooltip);
            }
        }
        // label the axes! (per https://xkcd.com/833/)
        for (var day = day_min; day <= day_max; day += day_major)
        {
            var x = zero_day_x + day_scale * day;
            var y = 0.5 * (jump_axle_y + flex_axle_y);
            var label = '' + day;
            if (day > 0)
                label = '+' + day;
            sstr += svg_text(label, x, y, text_size, text_color, 'middle', 'middle', 'bold');
            sstr += svg_line(x, flex_axle_y + gap, x, flex_axle_y * 0.9 + jump_axle_y * 0.1, '#888', 2);
            sstr += svg_line(x, jump_axle_y - gap, x, jump_axle_y * 0.8 + flex_axle_y * 0.2, '#888', 2);
        }
        // sstr += svg_text(''+this.jump_days_histogram.length+' days',
        //          graph_mid, graph_top - 0.2 * text_size, text_size, text_color, 'middle', 'baseline');

        // sstr += svg_text('max delay '+max_flex_days+' days',
        //          0.5 * (graph_mid + graph_right), graph_bot - (day_scale * max_flex_days) - 0.2 * text_size, 0.5 * text_size, text_color, 'middle', 'baseline');

        sstr += "</g>\n";
        sstr += "</svg>\n";
        return sstr;
    }

    this.print_csv_to_string = function(most_recent_cohort)
    {
        var out_str = '';
        out_str += 'SIMULATION RESULTS\n';
        out_str += 'Number of doses,' + this.num_slots + '\n';
        out_str += 'Doses per day,' + this.num_slots_per_day + '\n';
        out_str += 'Number of days,' + this.num_days + '\n';
        out_str += 'Bump price,$' + this.bump_price + '\n';
        out_str += 'Number of simulations,' + this.total_cohorts + '\n';
        out_str += '\n';

        out_str += 'PER-DAY HISTOGRAM\n';
        out_str += 'days,flexers,jumpers\n';
        for (var i = 0; i < this.num_days; ++i)
            out_str += '' + i + ',' + this.flex_days_histogram[i] + ',' + this.jump_days_histogram[i] + '\n';
        out_str += '\n';

        out_str += 'PER-SLOT HISTOGRAM\n';
        out_str += 'slots,flexers,jumpers,slot-day,jump-price\n';
        for (var i = 0; i < this.num_slots; ++i)
            out_str += '' + i + ',' + this.flex_slot_histogram[i] + ',' + this.jump_slot_histogram[i] + ',' + Math.floor(i / this.num_slots_per_day) + ',$' + (i * this.bump_price).toFixed(2) + '\n';

        out_str += 'DETAILS OF ONE COHORT\n';
        out_str += most_recent_cohort.print_to_csv_string();
        return out_str;
    }
}

// Data based roughly on a 2019 article by Maurie Backman
//  posted at https://www.fool.com/the-ascent/research/average-savings-account-balance/
// Used to get randomized savings.
// Here's how to read this: ____ of the population has savings of ____ or less.
var savings_chart_percents = [2.97, 20.23, 33.88, 55.87, 69.38, 77.02, 81.69, 86.50, 91.17, 95.63,    99.90,  100.00];
var savings_chart_dollars  = [   0,   500,  1000,  5000, 10000, 15000, 20000, 25000, 50000, 100000, 1000000, 5000000];
function make_random_savings()
{
    var pct = savings_chart_percents;
    var dol = savings_chart_dollars;
    var dice1 = 100 * Math.random();
    var dice2 = 0.8 + 0.4 * Math.random(); // randomize +/- 20%

    if (dice1 <= pct[0])
        return 0;
    var chart_index = 1;
    while (dice1 > pct[chart_index])
        chart_index++;

    var t = (dice1 - pct[chart_index - 1]) / (pct[chart_index] - pct[chart_index - 1]);
    savings = dol[chart_index - 1] + t * (dol[chart_index] - dol[chart_index - 1]);
    return Math.floor(savings * dice2);
}

function dollar_text(dollars)
{
    return '$' + Math.round(dollars).toLocaleString();
}

function comma_text(num)
{
    return Math.round(num).toLocaleString();
}

function svg_line(x1, y1, x2, y2, stroke_color, thickness=1)
{
    var sstr = "  <path d=\"";
    sstr += "M" + x1 + "," + y1 + "L" + x2 + "," + y2;
    sstr += "\" fill=\"none\" stroke=\"" + stroke_color + "\" stroke-width=\"" + thickness + "\">" + "</path>\n";
    return sstr;
}

function svg_box(x1, y1, w, h, fill_color, stroke_color='#000', thickness=0, corner_radius=0, fill_opacity=1, stroke_opacity=0, tooltip='')
{
    var sstr = '';
    sstr += "<rect "
        + "x=\"" + x1 + "\" "
        + "y=\"" + y1 + "\" "
        + "width=\"" + w + "\" "
        + "height=\"" + h + "\" "
        + "rx=\"" + corner_radius + "\" "
        + "ry=\"" + corner_radius + "\" "
        + "fill=\"" + fill_color + "\" "
        + "stroke=\"" + stroke_color + "\" "
        + "fill-opacity=\"" + fill_opacity + "\" "
        + "stroke-opacity=\"" + stroke_opacity + "\" "
        + "stroke-width=\""+ thickness + "\" ";
    sstr += ">";
    if (tooltip)
        sstr += "<title>" + tooltip + "</title>";
    sstr += "</rect>\n";
    return sstr;
}

function svg_text(text, x, y, text_size, fill_color, halign, valign, weight='normal')
{
    // halign is "start", "middle", "end"
    // valign is "baseline", "hanging", "middle"
    var sstr = "<text class=\"hover_labels_0\" x=\"" + x + "\" y=\"" + y
         + "\" font-family=\"Tahoma\" alignment-baseline=\"" + valign + "\" text-anchor=\"" + halign + "\" "
         + "stroke=\"none\" fill=\"" + fill_color + "\" fill-opacity=\"1.0\" font-size=\"" + text_size + "\" font-weight=\"" + weight + "\">"
         + text + "</text>";
    return sstr;
}

var month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function date_to_string(date)
{
    var dd = String(date.getDate()).padStart(2, '0');
    var mm = month_names[date.getMonth()];
    var yyyy = date.getFullYear();
    return '' + mm + ' ' + dd + ' ' + yyyy;
}

function make_shuffle(num_indices)
{
    var shuffled = []
    for (var i = 0; i < num_indices; ++i)
        shuffled.push(i);
    var index = num_indices;
    var rand_index;
    var temp;
    while (index > 0)
    {
        rand_index = Math.floor(Math.random() * index);
        index--;
        temp = shuffled[index];
        shuffled[index] = shuffled[rand_index];
        shuffled[rand_index] = temp;
    }
    return shuffled;
}

function days_after_today(days_after)
{
    var today = new Date();
    today.setDate(today.getDate() + days_after);
    return today;
}

function int_in_range_inclusive(min_val, max_val)
{
    return min_val + Math.floor(Math.random() * (max_val - min_val));
}

function enforce_currency_number(box)
{
    box.value = parseFloat(box.value).toFixed(2);
}

function run_simulations()
{
    var brag_box         = document.getElementById('brag_box');
    var multi_graph_span = document.getElementById('multi_graph_span');
    var num_sims         = parseInt(document.getElementById('num_sims_input').value);
    var number_of_doses  = parseInt(document.getElementById('total_doses_input').value);
    var doses_per_day    = parseInt(document.getElementById('doses_per_day_input').value);
    var bump_price       = parseFloat(document.getElementById('bump_price_input').value);
    var check_slide      = document.getElementById('check_slide_input');
    var check_swap       = document.getElementById('check_swap_input');
    var bump_method = QUEUE_SHIFT_SHARE;
    if (check_slide && check_slide.checked)
        bump_method = QUEUE_SHIFT;
    if (check_swap && check_swap.checked)
        bump_method = QUEUE_SWAP;
    brag_box.innerHTML = 'Running ' + num_sims + ' simulations for ' + number_of_doses + ' people...';
    var multi_run_data = new MultiRunData();
    var most_recent_cohort = null;
    var start_time = new Date();
    for (var sim_index = 0; sim_index < num_sims; ++sim_index)
    {
        var cohort = new Cohort(number_of_doses, doses_per_day, bump_price, bump_method);
        cohort.let_people_choose();
        multi_run_data.accumulate(cohort);
        most_recent_cohort = cohort;
    }
    var elapsed_time = (new Date() - start_time) / 1000.00;
    brag_box.innerHTML = 'Finished ' + num_sims + ' sims with ' + number_of_doses + ' people in ' + elapsed_time.toFixed(3) + ' seconds.';
    multi_graph_span.innerHTML = multi_run_data.print_svg_to_string_v2();
    most_recent_csv_results = multi_run_data.print_csv_to_string(most_recent_cohort);
}

function update_cohort_duration()
{
    var number_of_doses  = parseInt(document.getElementById('total_doses_input').value);
    var doses_per_day    = parseInt(document.getElementById('doses_per_day_input').value);
    var duration_span = document.getElementById('cohort_duration_span');
    var total_days = Math.ceil(number_of_doses / doses_per_day);
    sstr = '(Vaccination will take ' + total_days + ' days';
    if (total_days > 365.25)
        sstr += ', so about ' + (total_days / 365.25).toFixed(1) + ' years';
    else if (total_days > 30.5)
        sstr += ', so about ' + (total_days / 30.5).toFixed(1) + ' months';
    sstr += '.)';
    duration_span.innerHTML = sstr;
}

function download_svg()
{
    download_text('graph.svg', document.getElementById('multi_graph_span').innerHTML, 'image/svg+xml');
}

var most_recent_csv_results = '(no results yet)';
function download_csv()
{
    download_text('sim-results.csv', most_recent_csv_results, 'text/csv');
}

function download_text(filename, text, filetype)
{
  console.log(filename);
  console.log(text);
  var element = document.createElement('a');
  element.setAttribute('href', 'data:' + filetype + ';charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

function do_when_page_loaded()
{
    update_cohort_duration();
    run_simulations();
}

// A list of 4,250 names, from Tzioumis, Konstantinos (2018) Demographic aspects of first names, Scientific Data, 5:180025 [dx.doi.org/10.1038/sdata.2018.25]
// I added these to remind me that these are people, not numbers.
var list_of_names = ['Aaron','Abbas','Abbey','Abbie','Abby','Abdul','Abdullah','Abe','Abel','Abelardo','Abhijit','Abhishek','Abigail','Abner','Abraham','Abram','Ada','Adalberto','Adam','Adan','Addie','Adel','Adela','Adelaida','Adelaide','Adele','Adelina','Adeline','Adina','Admir','Adnan','Adolfo','Adolph','Adria','Adrian','Adriana','Adriane','Adrianna','Adrianne','Adrienne','Afshin','Agata','Agatha','Agnes','Agnieszka','Agustin','Ahmad','Ahmed','Ahmet','Ai','Aida','Aileen','Aimee','Aisha','Ajay','Ajit','Akbar','Akiko','Al','Alain','Alaina','Alan','Alana','Alane','Alanna','Alastair','Alba','Albert','Alberta','Alberto','Alden','Aldo','Alec','Alecia','Alejandra','Alejandro','Aleksandar','Aleksander','Aleksandr','Aleksandra','Aleksey','Alen','Alena','Alene','Alesha','Alesia','Alessandra','Alessandro','Aleta','Alex','Alexa','Alexander','Alexandr','Alexandra','Alexandre','Alexandria','Alexandru','Alexei','Alexey','Alexia','Alexis','Alf','Alfonso','Alfred','Alfreda','Alfredo','Ali','Alia','Alice','Alicia','Alicja','Alida','Alina','Aline','Alireza','Alisa','Alisha','Alison','Alissa','Alistair','Alix','Aliza','Alka','Alla','Allan','Allen','Allene','Allison','Allyn','Allyson','Alma','Alok','Alon','Alonso','Alonzo','Alphonse','Alphonso','Alta','Altagracia','Althea','Alton','Alva','Alvaro','Alvin','Alyce','Alycia','Alyse','Alysia','Alyson','Alyssa','Amado','Amador','Amal','Amalia','Amanda','Amar','Amarjit','Amber','Amelia','Amer','Ami','Amie','Amin','Amina','Amir','Amit','Amita','Amos','Amparo','Amy','An','Ana','Anabel','Anand','Anastasia','Anatoliy','Anatoly','Anca','Anders','Anderson','Andra','Andre','Andrea','Andreas','Andrei','Andres','Andrew','Andrey','Andria','Andriy','Andrzej','Andy','Aneta','Angel','Angela','Angelia','Angelica','Angelika','Angelina','Angeline','Angelique','Angelita','Angelo','Angie','Angus','Anh','Ani','Anibal','Anil','Anila','Anissa','Anita','Anja','Anjali','Anjana','Anjanette','Anju','Ankur','Ann','Anna','Annabel','Annabelle','Annalisa','Annamaria','Annamarie','Anne','Anneliese','Annemarie','Annetta','Annette','Annie','Annmarie','Anselmo','Anson','Anthony','Antje','Antoine','Antoinette','Anton','Antonella','Antonette','Antonia','Antonietta','Antonina','Antonino','Antonio','Antony','Anup','Anuradha','Anwar','Aparna','April','Ara','Araceli','Aracely','Aram','Arash','Arcelia','Archana','Archie','Arden','Ardis','Ari','Ariana','Arianne','Aric','Arie','Ariel','Arif','Arkadiusz','Arkady','Arla','Arleen','Arlen','Arlene','Arlette','Arlie','Arline','Arlyn','Armand','Armando','Armen','Armida','Armin','Arnaldo','Arne','Arnel','Arno','Arnold','Arnoldo','Arnulfo','Aron','Arsen','Arsenio','Art','Artemio','Arthur','Arti','Artur','Arturo','Arun','Aruna','Arvin','Arvind','Asa','Asha','Ashish','Ashlee','Ashleigh','Ashley','Ashlie','Ashok','Ashraf','Ashton','Ashwin','Asif','Asim','Asma','Astrid','Athanasios','Athena','Atul','Aubrey','Audra','Audrey','August','Augustin','Augustine','Augusto','Augustus','Aura','Aurea','Aurelia','Aurelio','Aurora','Austin','Autumn','Ava','Avelino','Avery','Avi','Avis','Aviva','Axel','Ayanna','Aziz','Azucena','Ba','Babak','Babette','Bahman','Bahram','Bailey','Balaji','Baldev','Baltazar','Balwinder','Bambi','Bao','Barbara','Barbra','Barney','Barrett','Barrie','Barron','Barry','Bart','Bartholomew','Bartley','Barton','Basil','Bassam','Baxter','Beata','Beate','Beatrice','Beatriz','Beau','Beckie','Becky','Belen','Belinda','Bella','Ben','Benedetto','Benedict','Benigno','Benita','Benito','Benjamin','Bennett','Bennie','Benny','Benson','Benton','Bernabe','Bernadette','Bernadine','Bernard','Bernardino','Bernardo','Bernhard','Bernice','Bernie','Bert','Berta','Bertha','Bertram','Bertrand','Beryl','Bessie','Beth','Bethann','Bethanne','Bethany','Betsy','Bette','Bettie','Bettina','Betty','Bettye','Beulah','Beverley','Beverly','Bharat','Bhavna','Bhupinder','Bianca','Bibi','Bijan','Bill','Billie','Billy','Bin','Bina','Bing','Binh','Bipin','Birgit','Birgitta','Bjorn','Blaine','Blair','Blaise','Blake','Blanca','Blanche','Blas','Blythe','Bo','Bob','Bobbi','Bobbie','Bobby','Bogdan','Boguslaw','Bohdan','Bong','Bonifacio','Bonita','Bonni','Bonnie','Bonny','Boris','Boyd','Bozena','Brad','Bradd','Braden','Bradford','Bradley','Bradly','Brady','Branden','Brandi','Brandie','Brandon','Brandt','Brandy','Branko','Brannon','Brant','Breanna','Breanne','Bree','Brenda','Brendan','Brendon','Brenna','Brennan','Brent','Brenton','Bret','Brett','Brian','Briana','Brianna','Brianne','Brice','Bridget','Bridgett','Bridgette','Bridgit','Brien','Brienne','Brigette','Brigid','Brigida','Brigitte','Brijesh','Brion','Brita','Britney','Britt','Britta','Brittany','Brittney','Britton','Brock','Brodie','Brody','Bronwyn','Brook','Brooke','Brooks','Bruce','Bruno','Bryan','Bryant','Bryce','Bryn','Brynn','Bryon','Bryson','Buck','Bud','Buddy','Buffy','Buford','Burke','Burt','Burton','Byron','Byung','Cade','Caesar','Caitlin','Cale','Caleb','Callie','Calvin','Cam','Camelia','Cameron','Cami','Camie','Camilla','Camille','Camilo','Can','Candace','Candelario','Candi','Candice','Candida','Candido','Candis','Candy','Candyce','Cara','Caren','Carey','Cari','Caridad','Carie','Carin','Carina','Carissa','Carl','Carla','Carlee','Carleen','Carlene','Carleton','Carley','Carlie','Carlin','Carlo','Carlos','Carlotta','Carlton','Carly','Carlyn','Carma','Carmel','Carmela','Carmelita','Carmella','Carmelo','Carmen','Carmine','Carol','Carola','Carolann','Carole','Carolee','Carolina','Caroline','Carolyn','Carolynn','Caron','Carri','Carrie','Carrol','Carroll','Carson','Carter','Cary','Caryl','Caryn','Casandra','Casey','Casimir','Cassandra','Cassidy','Cassie','Catalina','Caterina','Catharine','Catherine','Cathi','Cathie','Cathleen','Cathryn','Cathy','Catrina','Cecelia','Cecil','Cecile','Cecilia','Cecilio','Cecily','Cedric','Celeste','Celestino','Celia','Celina','Celine','Celso','Cesar','Cezary','Chad','Chadwick','Chan','Chance','Chanda','Chandler','Chandra','Chang','Chanh','Channing','Chantal','Chantel','Chantelle','Chao','Charissa','Charisse','Charity','Charla','Charleen','Charlene','Charles','Charley','Charlie','Charlotte','Charmaine','Chase','Chasity','Chastity','Chau','Chauncey','Chee','Chelsea','Chelsey','Chen','Cheng','Cheri','Cherie','Cherise','Cherri','Cherrie','Cherry','Cherryl','Cheryl','Cheryle','Cheryll','Chester','Chet','Chetan','Cheuk','Cheyenne','Chi','Chia','Chien','Chih','Chin','Ching','Chinh','Chirag','Chitra','Chloe','Chong','Chris','Christa','Christal','Christel','Christen','Christi','Christian','Christiana','Christiane','Christianne','Christie','Christin','Christina','Christine','Christoph','Christophe','Christopher','Christos','Christy','Chrystal','Chu','Chuan','Chuck','Chun','Chung','Chuong','Cinda','Cindee','Cindi','Cindy','Cipriano','Cirilo','Ciro','Clair','Claire','Clara','Clare','Clarence','Clarice','Clarissa','Clark','Clarke','Claude','Claudette','Claudia','Claudine','Claudio','Claus','Clay','Clayton','Clement','Clemente','Cleo','Cleve','Cleveland','Cliff','Clifford','Clifton','Clint','Clinton','Clive','Clyde','Coby','Cody','Colby','Cole','Coleen','Coleman','Colette','Colin','Colleen','Collette','Collin','Colm','Colt','Colton','Concepcion','Concetta','Connie','Conor','Conrad','Conrado','Constance','Constantin','Constantine','Constantino','Consuelo','Cora','Coral','Corazon','Corbett','Corbin','Cordelia','Cordell','Corey','Cori','Corie','Corina','Corine','Corinna','Corinne','Cornelia','Cornelio','Cornelius','Cornell','Corrie','Corrin','Corrine','Cort','Cortney','Cory','Cosmo','Courtenay','Courtney','Coy','Craig','Creighton','Cris','Crispin','Crista','Cristen','Cristi','Cristian','Cristie','Cristin','Cristina','Cristine','Cristobal','Cristopher','Cristy','Cruz','Crystal','Cuc','Cuong','Curt','Curtis','Curtiss','Cyndi','Cynthia','Cyril','Cyrus','Da','Dagoberto','Dai','Daisy','Dale','Dalene','Dalia','Daljit','Dallas','Dalton','Damaris','Damian','Damien','Damion','Damon','Dan','Dana','Dane','Danelle','Danette','Dang','Danh','Dani','Dania','Danial','Danica','Daniel','Daniela','Daniele','Daniella','Danielle','Danilo','Danita','Dann','Danna','Dannette','Dannie','Danny','Dante','Danuta','Dao','Daphne','Dara','Darby','Darci','Darcie','Darcy','Darek','Daren','Daria','Darian','Darin','Dario','Darius','Dariusz','Darko','Darla','Darleen','Darlene','Darnell','Daron','Darrel','Darrell','Darren','Darrick','Darrin','Darron','Darryl','Darwin','Daryl','Dat','Dave','David','Davin','Davina','Davis','Dawn','Dawna','Dawne','Dax','Dayle','Dayna','De','Dean','Deana','Deane','Deann','Deanna','Deanne','Debbi','Debbie','Debby','Debi','Debora','Deborah','Debra','Debrah','Declan','Dedra','Dee','Deeann','Deena','Deepa','Deepak','Deidra','Deidre','Deirdre','Del','Delaine','Delana','Delbert','Delfina','Delfino','Delia','Delilah','Dell','Della','Delma','Delmar','Delores','Deloris','Delphine','Delynn','Demetria','Demetrio','Demetrios','Demetrius','Dena','Deneen','Denice','Denis','Denise','Dennis','Denny','Denton','Denver','Deon','Derek','Deric','Derick','Derik','Deron','Derrick','Desiree','Desmond','Despina','Devin','Devon','Dewayne','Dewey','Dewitt','Dexter','Dian','Diana','Diane','Diann','Dianna','Dianne','Dick','Diego','Diem','Diep','Dieter','Dieu','Digna','Dilip','Dillon','Dimitri','Dimitrios','Dina','Dinah','Dinesh','Dinh','Dino','Dion','Dionisio','Dionne','Dipak','Dirk','Dixie','Dmitri','Dmitriy','Dmitry','Do','Doan','Dolly','Dolores','Domenic','Domenick','Domenico','Domingo','Dominic','Dominick','Dominique','Don','Dona','Donal','Donald','Donato','Dong','Donita','Donn','Donna','Donnell','Donnie','Donny','Donovan','Dora','Dorcas','Doreen','Dorene','Dori','Dorian','Dorina','Dorinda','Doris','Dorit','Doron','Dorota','Dorothea','Dorothy','Doug','Douglas','Douglass','Dov','Doyle','Dragan','Drake','Drew','Dru','Duane','Duc','Dudley','Duke','Dulce','Duncan','Dung','Duong','Dustin','Dusty','Duy','Dwain','Dwaine','Dwayne','Dwight','Dyan','Dylan','Dzung','Earl','Earle','Earlene','Earline','Earnest','Earnestine','Ebony','Ed','Eddie','Eddy','Eden','Edgar','Edgardo','Edie','Edilberto','Edison','Edith','Edmond','Edmund','Edmundo','Edna','Eduard','Eduardo','Edward','Edwin','Edwina','Edyta','Effie','Efrain','Efren','Eileen','Ekaterina','Elaina','Elaine','Elana','Elba','Elbert','Elda','Elden','Eldon','Eleanor','Eleanore','Eleazar','Eleftherios','Elena','Eleni','Eleonora','Eli','Elia','Eliana','Elias','Elida','Elie','Elijah','Elin','Elinor','Elio','Eliot','Elisa','Elisabeth','Elise','Eliseo','Elisha','Elissa','Eliza','Elizabeth','Elke','Ella','Ellen','Ellie','Elliot','Elliott','Ellis','Ellyn','Elma','Elmer','Eloisa','Eloise','Eloy','Elpidio','Elsa','Elsie','Elton','Elva','Elvia','Elvin','Elvira','Elvis','Elwin','Elwood','Elyse','Elyssa','Elzbieta','Emad','Emanuel','Emerson','Emery','Emil','Emile','Emilee','Emilia','Emiliano','Emilie','Emilio','Emily','Emma','Emmanuel','Emmett','Emory','Enedina','Enid','Enrico','Enrique','Enriqueta','Epifanio','Eran','Erasmo','Eric','Erica','Erich','Erick','Ericka','Erik','Erika','Erin','Erinn','Erlinda','Erma','Ernest','Ernestina','Ernestine','Ernesto','Ernie','Ernst','Errol','Ervin','Erwin','Eryn','Esmeralda','Esperanza','Essie','Esteban','Estela','Estella','Estelle','Ester','Esther','Estrella','Ethan','Ethel','Etta','Eugene','Eugenia','Eugenio','Eula','Eulalia','Eun','Eunice','Eusebio','Eva','Evan','Evangelina','Evangeline','Evangelos','Evans','Eve','Evelia','Evelina','Evelyn','Everardo','Everett','Evette','Evonne','Ewa','Eyal','Ezequiel','Ezra','Fabian','Fabio','Fabiola','Fadi','Fae','Faisal','Faith','Fan','Fang','Fannie','Fanny','Farah','Farhad','Fariborz','Farid','Farida','Farrah','Fatima','Faustino','Fausto','Fawn','Fay','Faye','Fe','Federico','Fei','Felecia','Felice','Felicia','Feliciano','Felicitas','Felipe','Felix','Fen','Feng','Ferdinand','Fermin','Fern','Fernanda','Fernando','Fidel','Fidencio','Filiberto','Filomena','Fiona','Flavia','Flavio','Fletcher','Flor','Flora','Florence','Florencio','Florentino','Florian','Florin','Floyd','Fonda','Ford','Forest','Forrest','Fran','Frances','Francesca','Francesco','Francine','Francis','Francisca','Francisco','Franco','Francois','Frank','Frankie','Franklin','Franklyn','Franz','Fred','Freda','Freddie','Freddy','Frederic','Frederick','Fredric','Fredrick','Fredy','Frieda','Friedrich','Fritz','Fu','Gabino','Gabriel','Gabriela','Gabriele','Gabriella','Gabrielle','Gaetano','Gail','Gale','Galen','Galina','Ganesh','Gang','Garen','Gareth','Garland','Garnet','Garret','Garrett','Garrick','Garrison','Garry','Garth','Gary','Gaspar','Gaurav','Gautam','Gavin','Gay','Gaye','Gayla','Gayle','Gaylen','Gaylene','Gaylord','Ge','Geeta','Geetha','Gemma','Gena','Genaro','Gene','Geneva','Genevieve','Gennady','Gennaro','Genoveva','Geoff','Geoffrey','Georg','George','Georgene','Georgette','Georgi','Georgia','Georgiana','Georgianna','Georgina','Gerald','Geraldine','Geralyn','Gerard','Gerardo','Gerd','Gerhard','Geri','Germaine','German','Geronimo','Gerri','Gerrie','Gerry','Gertrude','Ghassan','Gheorghe','Gia','Giancarlo','Giang','Giao','Gideon','Gigi','Gil','Gilbert','Gilberto','Gilda','Gildardo','Giles','Gilles','Gillian','Gina','Ginette','Ginger','Ginny','Gino','Giovanna','Giovanni','Girish','Gisela','Gisele','Giselle','Gita','Giulio','Giuseppe','Giuseppina','Gladys','Glen','Glenda','Glenn','Glenna','Glennon','Gloria','Glory','Glynn','Gonzalo','Gopal','Goran','Gordana','Gordon','Grace','Gracie','Graciela','Grady','Graeme','Graham','Graig','Grant','Graydon','Grayson','Grazyna','Greg','Gregg','Greggory','Gregoria','Gregorio','Gregory','Greta','Gretchen','Gricelda','Grigor','Grigoriy','Griselda','Grover','Grzegorz','Guadalupe','Guan','Guang','Gudrun','Guido','Guillermina','Guillermo','Gunnar','Gunther','Guo','Gurpreet','Gus','Gustav','Gustavo','Guy','Gwen','Gwendolyn','Gwyn','Gwyneth','Ha','Habib','Hae','Hai','Hailey','Haim','Hakop','Hal','Haley','Halina','Hallie','Hamid','Hamilton','Han','Hana','Hanan','Hang','Hanh','Hani','Hank','Hanna','Hannah','Hannelore','Hans','Hany','Hao','Harald','Hari','Harinder','Harish','Harjinder','Harlan','Harley','Harmony','Harold','Harpreet','Harriet','Harriett','Harris','Harrison','Harry','Harvey','Hasan','Hasmik','Hassan','Hattie','Hau','Haydee','Hayden','Hayley','Hazel','Heath','Heather','Hector','Hedy','Hee','Heide','Heidi','Heike','Heinz','Helen','Helena','Helene','Helga','Helmut','Hema','Hemant','Hendrik','Heng','Henri','Henrietta','Henrik','Henry','Henryk','Herb','Herbert','Heriberto','Herlinda','Herman','Hermelinda','Herminia','Herminio','Hernan','Herve','Hetal','Hien','Hiep','Hieu','Hilario','Hilary','Hilda','Hillary','Himanshu','Hina','Hing','Hipolito','Hiram','Hiroko','Hisham','Hitesh','Ho','Hoa','Hoai','Hoan','Hoang','Hoi','Holley','Holli','Hollie','Hollis','Holly','Homer','Homero','Hong','Hope','Horace','Horacio','Horst','Hortencia','Hossein','Houston','Howard','Hoyt','Hsiu','Hua','Huan','Hubert','Hue','Huey','Hugh','Hugo','Hui','Humberto','Hun','Hung','Hunter','Huong','Hussein','Huy','Huyen','Hwa','Hye','Hyo','Hyun','Hyung','Iain','Ian','Ibrahim','Ida','Idalia','Ignacio','Igor','Ihor','Ila','Ilan','Ilana','Ileana','Ilene','Iliana','Ilias','Ilona','Ilya','Imad','Imelda','Imogene','Imran','In','Ina','Inderjit','India','Indira','Ines','Inez','Inga','Inge','Ingeborg','Ingrid','Inna','Ioan','Ioana','Ioannis','Iqbal','Ira','Irena','Irene','Irina','Iris','Irma','Irvin','Irving','Irwin','Iryna','Isaac','Isabel','Isabella','Isabelle','Isaiah','Isaias','Isela','Isidro','Ismael','Ismail','Israel','Issa','Issac','Iva','Ivan','Ivana','Ivette','Ivonne','Ivory','Ivy','Iwona','Jacalyn','Jace','Jacek','Jacinta','Jacinto','Jack','Jacki','Jackie','Jacklyn','Jackson','Jacky','Jaclyn','Jacob','Jacque','Jacquelin','Jacqueline','Jacquelyn','Jacquelynn','Jacques','Jacy','Jada','Jade','Jadwiga','Jae','Jagdish','Jai','Jaime','Jaimee','Jaimie','Jairo','Jake','Jamal','Jamee','James','Jamey','Jami','Jamie','Jamil','Jamila','Jamison','Jan','Jana','Janae','Jane','Janeen','Janel','Janell','Janelle','Janene','Janet','Janette','Janey','Jani','Janice','Janie','Janina','Janine','Janis','Jann','Janna','Jannette','Janusz','Jaqueline','Jared','Jarett','Jarod','Jaroslaw','Jarred','Jarrett','Jarrod','Jarvis','Jasbir','Jasen','Jasmin','Jasmine','Jason','Jasper','Jaswinder','Jatinder','Javier','Jay','Jayant','Jaye','Jayesh','Jayme','Jayne','Jayson','Jean','Jeana','Jeanette','Jeanie','Jeanine','Jeanmarie','Jeanna','Jeanne','Jeannette','Jeannie','Jeannine','Jeb','Jed','Jedidiah','Jee','Jeff','Jefferey','Jefferson','Jeffery','Jeffrey','Jeffry','Jelena','Jena','Jenell','Jenelle','Jenifer','Jenine','Jenna','Jenni','Jennie','Jennifer','Jennine','Jenny','Jens','Jeong','Jerad','Jerald','Jere','Jeremiah','Jeremy','Jeri','Jerilyn','Jermaine','Jerod','Jerold','Jerome','Jeromy','Jerre','Jerri','Jerrie','Jerrod','Jerrold','Jerry','Jerzy','Jess','Jesse','Jessica','Jessie','Jessy','Jesus','Jewel','Jewell','Ji','Jia','Jian','Jianguo','Jianhua','Jianwei','Jie','Jignesh','Jill','Jillian','Jim','Jimmie','Jimmy','Jin','Jing','Jitendra','Jo','Joan','Joani','Joanie','Joann','Joanna','Joanne','Joao','Joaquim','Joaquin','Jocelyn','Jodee','Jodell','Jodi','Jodie','Jody','Joe','Joel','Joelle','Joellen','Joerg','Joetta','Joette','Joey','Johan','Johann','Johanna','Johannes','John','Johna','Johnathan','Johnathon','Johnie','Johnna','Johnnie','Johnny','Johnpaul','Johnson','Joi','Jolanta','Joleen','Jolene','Jolie','Joline','Jolyn','Jolynn','Jon','Jonah','Jonas','Jonathan','Jonathon','Jonelle','Jong','Joni','Jonna','Joo','Joon','Jordan','Jorge','Jory','Jose','Josef','Josefa','Josefina','Joselito','Joseph','Josephine','Josette','Josh','Joshua','Josiah','Josie','Joslyn','Josue','Jovita','Joy','Joyce','Joycelyn','Jozef','Juan','Juana','Juanita','Juanito','Judah','Judd','Jude','Judi','Judie','Judith','Judson','Judy','Juergen','Julee','Julene','Jules','Juli','Julia','Julian','Juliana','Juliane','Juliann','Julianna','Julianne','Julie','Julieann','Julien','Juliet','Julieta','Juliette','Julio','Julissa','Julius','Jun','June','Jung','Junior','Justin','Justina','Justine','Justo','Jutta','Juvenal','Juventino','Jyoti','Ka','Kacey','Kacie','Kacy','Kai','Kaitlin','Kaitlyn','Kala','Kale','Kalen','Kalpana','Kam','Kamal','Kamaljit','Kambiz','Kami','Kamlesh','Kamran','Kandace','Kandi','Kandice','Kandis','Kandy','Kang','Kao','Kara','Karalee','Karan','Karen','Karey','Kari','Karie','Karim','Karin','Karina','Karine','Karissa','Karl','Karla','Karleen','Karlene','Karli','Karma','Karmen','Karol','Karolyn','Karon','Karri','Karrie','Karry','Karthik','Kary','Karyn','Kasey','Kassandra','Katarina','Katarzyna','Kate','Katelyn','Katerina','Katharine','Kathe','Katherin','Katherine','Katheryn','Kathi','Kathie','Kathleen','Kathlyn','Kathrin','Kathrine','Kathryn','Kathryne','Kathy','Kati','Katie','Katina','Katrin','Katrina','Katy','Kaushik','Kavita','Kavitha','Kay','Kayce','Kaye','Kayla','Kaylee','Kayleen','Kaylyn','Kazimierz','Ke','Kee','Keegan','Keely','Keenan','Keiko','Keisha','Keith','Keli','Kelle','Kellee','Kelleen','Kelley','Kelli','Kellie','Kelly','Kelsey','Kelvin','Ken','Kendal','Kendall','Kendra','Kendrick','Kenia','Kenna','Kenneth','Kenny','Kent','Kenton','Kenya','Kenyon','Keren','Keri','Kerin','Kermit','Kerri','Kerrie','Kerry','Kerstin','Ketan','Kevan','Keven','Kevin','Khaled','Khalid','Khalil','Khang','Khanh','Khoa','Khoi','Ki','Kia','Kien','Kieran','Kiersten','Kiet','Kieu','Kiley','Kim','Kimball','Kimber','Kimberlee','Kimberley','Kimberli','Kimberlie','Kimberly','Kin','King','Kinga','Kip','Kira','Kiran','Kirby','Kirk','Kirsten','Kirstin','Kirt','Kishore','Kit','Kitty','Klaus','Koji','Kong','Konrad','Konstantin','Konstantinos','Korey','Kori','Kory','Kostas','Kou','Kraig','Kris','Krishna','Krista','Kristal','Kristan','Kristen','Kristi','Kristian','Kristie','Kristin','Kristina','Kristine','Kristofer','Kristoffer','Kristopher','Kristy','Kristyn','Krysta','Krystal','Krystle','Krystyna','Krzysztof','Kulwant','Kulwinder','Kumar','Kun','Kuo','Kurt','Kurtis','Kwang','Kwok','Kwong','Ky','Kyaw','Kyla','Kyle','Kylie','Kymberly','Kyong','Kyra','Kyu','Kyung','Lacey','Lacy','Ladonna','Lael','Lai','Laila','Laird','Lakisha','Lakshmi','Lam','Lamar','Lamont','Lan','Lana','Lance','Landon','Lane','Lanette','Lani','Lanny','Lara','Laraine','Larisa','Larissa','Larry','Lars','Larue','Larysa','Laszlo','Latanya','Latasha','Latisha','Latonya','Latoya','Latrice','Launa','Laura','Lauralee','Laureen','Laurel','Lauren','Laurence','Laurene','Laurent','Lauretta','Lauri','Laurie','Laurin','Lauro','Lavern','Laverne','Lavon','Lavonne','Lawanda','Lawrence','Layne','Lazaro','Le','Lea','Leah','Leandro','Leann','Leanna','Leanne','Lee','Leeann','Leena','Leesa','Lei','Leif','Leigh','Leighton','Leila','Leilani','Leisa','Lela','Leland','Lelia','Len','Lena','Lenard','Lenny','Lenora','Lenore','Leo','Leobardo','Leon','Leona','Leonard','Leonardo','Leonel','Leonid','Leonor','Leonora','Leopoldo','Leora','Leroy','Les','Lesa','Leslee','Lesley','Lesli','Leslie','Lesly','Lester','Leszek','Leta','Letha','Leticia','Letitia','Levi','Levon','Lewis','Lex','Lezlie','Li','Lia','Liam','Lian','Liana','Liane','Liang','Lianne','Libby','Lida','Lidia','Liem','Lien','Liesl','Ligia','Lihua','Liisa','Lila','Lili','Lilia','Lilian','Liliana','Lilibeth','Liliya','Lillian','Lillie','Lilly','Lily','Liming','Lin','Lina','Lincoln','Linda','Lindsay','Lindsey','Lindy','Linette','Ling','Linh','Linnea','Lino','Linsey','Linwood','Lionel','Lior','Lisa','Lisandro','Lisbeth','Lise','Lisette','Lissa','Lissette','Lita','Liv','Livia','Liviu','Lixin','Liz','Liza','Lizabeth','Lizbeth','Lizette','Ljiljana','Lloyd','Loan','Loc','Logan','Loi','Lois','Lola','Lolita','Lon','Lona','Long','Loni','Lonna','Lonnie','Lonny','Lora','Loraine','Loree','Loreen','Lorelei','Loren','Lorena','Lorene','Lorenza','Lorenzo','Loreto','Loretta','Lori','Loriann','Lorie','Lorilee','Lorin','Lorinda','Lorna','Lorne','Lorraine','Lorri','Lorrie','Lory','Lottie','Lou','Louann','Louanne','Louella','Louie','Louis','Louisa','Louise','Lourdes','Lowell','Loyd','Lu','Luan','Luana','Luann','Luanne','Luc','Luca','Lucas','Lucia','Lucian','Luciana','Luciano','Lucie','Lucien','Lucila','Lucille','Lucinda','Lucio','Lucretia','Lucy','Lucyna','Ludmila','Luigi','Luis','Luisa','Luiz','Lukas','Lukasz','Luke','Lula','Lupe','Luther','Luz','Ly','Lydia','Lyle','Lyman','Lyn','Lynda','Lyndon','Lyndsay','Lyndsey','Lynette','Lynn','Lynne','Lynnette','Lyubov','Lyudmila','Ma','Mabel','Mable','Mac','Maciej','Mack','Mackenzie','Madeleine','Madeline','Madelyn','Madhavi','Madhu','Madonna','Mae','Magaly','Magda','Magdalena','Magdy','Maggie','Maha','Mahendra','Maher','Mahesh','Mahmood','Mahmoud','Mai','Maia','Majid','Major','Maksim','Malcolm','Malgorzata','Malia','Malik','Malinda','Malissa','Mallory','Mamie','Mamta','Man','Mandeep','Mandi','Mandy','Manfred','Manh','Manish','Manisha','Manjit','Manju','Manjula','Manoj','Manpreet','Mansour','Manu','Manuel','Manuela','Mao','Mara','Marc','Marcel','Marcela','Marcelino','Marcella','Marcelle','Marcello','Marcelo','Marci','Marcia','Marcie','Marcin','Marco','Marcos','Marcus','Marcy','Mardi','Marek','Maren','Margaret','Margarita','Margarito','Margene','Margery','Margie','Margit','Margo','Margot','Marguerite','Mari','Maria','Mariah','Mariam','Marian','Mariana','Mariann','Marianna','Marianne','Mariano','Maribel','Maribeth','Maricela','Marie','Mariela','Marietta','Marijo','Marika','Marilee','Marilou','Marilyn','Marilynn','Marin','Marina','Marino','Mario','Marion','Marisa','Marisela','Marisol','Marissa','Marita','Maritza','Marius','Mariusz','Mariya','Marjorie','Marjory','Mark','Marko','Markus','Marla','Marleen','Marlena','Marlene','Marlin','Marlo','Marlon','Marlyn','Marlys','Marna','Marni','Marnie','Marsha','Marshall','Marta','Martha','Marti','Martin','Martina','Martine','Marty','Martyn','Marva','Marvin','Mary','Marya','Maryam','Maryann','Maryanne','Marybeth','Maryellen','Maryjane','Marylee','Marylou','Marylynn','Marzena','Mason','Masood','Masoud','Massimo','Mathew','Mathieu','Matilda','Matilde','Matt','Matthew','Matthias','Mattie','Maura','Maureen','Maurice','Mauricio','Mauro','Maury','Mavis','Max','Maxim','Maximiliano','Maximino','Maximo','Maxine','Maxwell','May','Maya','Mayank','Maynard','Mayra','Mazen','Meagan','Meaghan','Meena','Meera','Meg','Megan','Meggan','Meghan','Meghann','Mehdi','Mehmet','Mehran','Mehrdad','Mehul','Mei','Mel','Melanie','Melba','Melchor','Melina','Melinda','Melisa','Melissa','Mellisa','Melodie','Melody','Melonie','Melva','Melvin','Melvyn','Meng','Mercedes','Mercy','Meredith','Meri','Merideth','Meridith','Merle','Merlin','Merri','Merrie','Merrilee','Merrill','Merritt','Merry','Mervin','Meryl','Mi','Mia','Miao','Mica','Micaela','Micah','Micahel','Michael','Michaela','Michaelene','Michal','Michale','Micheal','Michel','Michele','Micheline','Michell','Michelle','Mickey','Mickie','Mieczyslaw','Migdalia','Miguel','Mihaela','Mihai','Mihail','Mikael','Mike','Mikel','Mikhail','Mikki','Mila','Milagros','Milan','Mildred','Milena','Miles','Milind','Millard','Millicent','Millie','Milo','Milos','Milton','Mimi','Min','Mina','Mindi','Mindy','Minerva','Ming','Minh','Minnie','Mira','Miranda','Mircea','Mireille','Mirela','Mireya','Miriam','Mirna','Miroslaw','Misael','Misti','Misty','Mitch','Mitchel','Mitchell','Mitra','Mitzi','Modesto','Mohamad','Mohamed','Mohammad','Mohammed','Mohan','Mohsen','Moira','Moises','Mollie','Molly','Mona','Monica','Monika','Monique','Monroe','Monte','Montgomery','Monty','Moon','Mordechai','Morgan','Morris','Morton','Moses','Moshe','Mostafa','Mu','Muhammad','Mukesh','Murali','Murat','Muriel','Murray','Mustafa','My','Mykhaylo','Myles','Myong','Myra','Myriam','Myrna','Myron','Myrtle','Myung','Nabil','Nada','Nadeem','Nader','Nadezhda','Nadia','Nadine','Nai','Nalini','Nam','Nan','Nancee','Nanci','Nancie','Nancy','Nanette','Nang','Nannette','Naomi','Napoleon','Narciso','Narendra','Naresh','Narinder','Nasser','Natalia','Natalie','Nataliya','Natalya','Natasha','Nate','Nathalie','Nathan','Nathanael','Nathaniel','Natividad','Naveen','Navin','Neal','Ned','Nedra','Neelam','Neena','Neeraj','Neeta','Neha','Neil','Nelda','Nelia','Nell','Nella','Nellie','Nelly','Nelson','Nenita','Nestor','Nettie','Neva','Neville','Nevin','Newton','Nga','Ngan','Nghia','Ngoc','Nguyen','Nguyet','Nhan','Nhu','Niall','Nichol','Nicholas','Nicholaus','Nichole','Nick','Nicki','Nickie','Nickolas','Nicky','Nicola','Nicolae','Nicolas','Nicole','Nicoletta','Nicolette','Nicolle','Niels','Nigel','Nikhil','Niki','Nikki','Nikola','Nikolai','Nikolaos','Nikolas','Nikolaus','Nikolay','Nikole','Nila','Nilda','Niles','Nilesh','Nils','Nina','Ning','Nirmal','Nirmala','Nisha','Nita','Nitin','Noah','Noe','Noel','Noelia','Noelle','Noemi','Nola','Nolan','Nona','Nora','Norbert','Norberto','Noreen','Norine','Norm','Norma','Norman','Normand','Norris','Nubia','Nunzio','Nydia','Oanh','Obdulia','Octavia','Octaviano','Octavio','Odell','Odessa','Odette','Ofelia','Ofer','Ok','Oksana','Ola','Ole','Oleg','Olena','Olga','Olin','Olive','Oliver','Olivia','Olivier','Ollie','Omar','Omer','Omid','Opal','Ora','Oralia','Oren','Orlando','Orrin','Orville','Oscar','Osvaldo','Oswaldo','Otis','Otto','Owen','Pablo','Padma','Page','Paige','Pam','Pamala','Pamela','Pamella','Panagiotis','Pankaj','Paola','Paolo','Parag','Paramjit','Paresh','Paris','Parker','Parminder','Parul','Parvin','Parviz','Pascal','Pascual','Pasquale','Pat','Patience','Patrica','Patrice','Patricia','Patricio','Patrick','Patsy','Patti','Pattie','Patty','Paul','Paula','Paulette','Paulina','Pauline','Paulino','Paulo','Pavel','Pawel','Pearl','Peder','Pedro','Peggie','Peggy','Pei','Penelope','Peng','Penni','Pennie','Penny','Per','Percy','Perla','Perry','Petar','Pete','Peter','Petr','Petra','Peyton','Phan','Phat','Phi','Phil','Philip','Philippe','Phillip','Phoebe','Phong','Phu','Phuc','Phung','Phuoc','Phuong','Phyllis','Pia','Pierre','Pieter','Pietro','Pilar','Ping','Piotr','Piper','Piyush','Po','Polly','Poonam','Porfirio','Portia','Pradeep','Prakash','Prasad','Prashant','Praveen','Pravin','Preeti','Prem','Preston','Prince','Priscilla','Priti','Priya','Prudence','Pui','Qi','Qian','Qiang','Qin','Qing','Qiu','Quan','Quang','Quentin','Quincy','Quinn','Quintin','Quinton','Quoc','Quy','Quyen','Quynh','Rachael','Racheal','Rachel','Rachele','Rachelle','Rae','Raelene','Rafael','Rafaela','Rafal','Raffaele','Raffi','Rafi','Rahul','Rainer','Raisa','Raj','Raja','Rajan','Rajeev','Rajendra','Rajesh','Rajinder','Rajiv','Raju','Rakesh','Raleigh','Ralf','Ralph','Ram','Rama','Raman','Ramesh','Rami','Ramin','Ramiro','Ramon','Ramona','Rana','Ranae','Rand','Randa','Randal','Randall','Randee','Randel','Randell','Randi','Randolph','Randon','Randy','Rania','Ranjit','Raoul','Raphael','Raquel','Rashid','Rashmi','Raul','Ravi','Ravinder','Ravindra','Ray','Raymond','Raymundo','Rayna','Reagan','Reba','Rebeca','Rebecca','Rebecka','Rebekah','Reed','Reena','Reese','Refugio','Regan','Regena','Reggie','Regina','Reginald','Reid','Reina','Reinaldo','Rekha','Remedios','Rena','Renae','Renata','Renate','Renato','Rene','Renea','Renee','Renita','Renu','Renuka','Retha','Reuben','Reva','Rex','Rey','Reyes','Reyna','Reynaldo','Reynold','Reza','Rhea','Rhett','Rhiannon','Rhoda','Rhonda','Rian','Ricardo','Rich','Richard','Richelle','Richie','Richmond','Rick','Rickey','Ricki','Rickie','Ricky','Rico','Rigoberto','Rikki','Riley','Rima','Rina','Risa','Rita','Ritchie','Ritesh','Ritu','Rob','Robb','Robbie','Robbin','Robby','Robert','Roberta','Roberto','Robin','Robyn','Rocco','Rochelle','Rocio','Rock','Rocky','Rod','Rodd','Roderic','Roderick','Rodger','Rodney','Rodolfo','Rodrick','Rodrigo','Rogelio','Roger','Rohan','Rohit','Roland','Rolando','Rolf','Rolland','Rollin','Roma','Roman','Romeo','Rommel','Romulo','Romy','Ron','Rona','Ronald','Ronaldo','Ronda','Ronen','Rong','Roni','Ronit','Ronna','Ronnie','Ronny','Rony','Roosevelt','Roque','Rory','Rosa','Rosalba','Rosalee','Rosalia','Rosalie','Rosalina','Rosalind','Rosalinda','Rosalio','Rosalva','Rosalyn','Rosana','Rosann','Rosanna','Rosanne','Rosario','Rosaura','Roscoe','Rose','Roseann','Roseanna','Roseanne','Rosella','Roselyn','Rosemarie','Rosemary','Rosendo','Rosetta','Roshan','Rosie','Rosio','Rosita','Roslyn','Ross','Roswitha','Rowena','Roxana','Roxane','Roxann','Roxanna','Roxanne','Roxie','Roy','Royal','Royce','Ruben','Rubina','Ruby','Rudolf','Rudolph','Rudy','Rufus','Rui','Rupert','Ruslan','Russ','Russel','Russell','Rustin','Rusty','Ruth','Ruthann','Ruthanne','Ruthie','Ryan','Ryann','Ryszard','Sabina','Sabine','Sabino','Sabra','Sabrina','Sachin','Sadie','Saeed','Sai','Said','Sal','Salim','Salina','Sallie','Sally','Salomon','Salvador','Salvatore','Sam','Samantha','Sameer','Samer','Sami','Samir','Samira','Sammie','Sammy','Samson','Samuel','San','Sandeep','Sander','Sandhya','Sandi','Sandor','Sandra','Sandy','Sanford','Sang','Sangeeta','Sangita','Sanjay','Sanjeev','Sanjiv','Santa','Santiago','Santo','Santos','Santosh','Sara','Sarah','Sari','Sarina','Sarita','Sarkis','Sasha','Satish','Satya','Sau','Saul','Saundra','Savannah','Saverio','Savita','Sawsan','Sayed','Scarlett','Schuyler','Scot','Scott','Scottie','Scotty','Seamus','Sean','Sebastian','See','Seema','Segundo','Selena','Selina','Selma','Sen','Seng','Seok','Seong','Serafin','Serena','Serge','Sergei','Sergey','Sergio','Sergiy','Seth','Seung','Seyed','Seymour','Shad','Shadi','Shae','Shahid','Shahin','Shahram','Shailesh','Shaina','Shalini','Shan','Shana','Shanda','Shane','Shankar','Shanna','Shannan','Shannon','Shanon','Shanti','Shao','Shara','Sharad','Sharee','Sharen','Shari','Sharilyn','Sharla','Sharlene','Sharon','Sharron','Sharyl','Sharyn','Shashi','Shaun','Shauna','Shawn','Shawna','Shawnee','Shay','Shayla','Shayna','Shayne','Shea','Sheela','Sheena','Sheila','Sheilah','Shelagh','Shelby','Sheldon','Shelia','Shelley','Shelli','Shellie','Shelly','Shelton','Sheng','Sheree','Sheri','Sheridan','Sherie','Sherilyn','Sherman','Sherri','Sherrie','Sherril','Sherrill','Sherry','Sherryl','Sherwin','Sherwood','Sheryl','Sheryle','Shi','Shih','Shiloh','Shilpa','Shin','Shira','Shirlee','Shirley','Shlomo','Shmuel','Shon','Shonda','Shu','Shuang','Shui','Shyam','Si','Siamak','Sidney','Siegfried','Sierra','Signe','Sigrid','Silas','Silvana','Silvia','Silvio','Sima','Simeon','Simon','Simona','Simone','Siobhan','Siu','Sivakumar','Sky','Skye','Skylar','Skyler','Slavica','Slawomir','Sloane','Slobodan','Smita','Snezana','So','Socorro','Sofia','Sohail','Sok','Soledad','Solomon','Sommer','Son','Sona','Sonal','Sondra','Song','Sonia','Sonja','Sonny','Sonya','Soo','Sook','Soon','Sophia','Sophie','Soraya','Soren','Spencer','Spiro','Sridhar','Srikanth','Srinivas','Srinivasa','Srinivasan','Sriram','Stacey','Staci','Stacia','Stacie','Stacy','Stan','Stanford','Stanislav','Stanislaw','Stanislawa','Stanley','Stanton','Starla','Starr','Stavros','Stefan','Stefani','Stefania','Stefanie','Stefano','Steffanie','Steffany','Steffen','Stella','Stepan','Stephan','Stephane','Stephani','Stephanie','Stephany','Stephen','Stephenie','Sterling','Stevan','Steve','Steven','Stevie','Stewart','Stuart','Su','Subhash','Sudha','Sudhakar','Sudhir','Sue','Sueann','Suellen','Suk','Sukhwinder','Suman','Sumit','Summer','Sun','Sunday','Sung','Sunil','Sunita','Sunny','Sunshine','Suong','Surendra','Suresh','Surinder','Susan','Susana','Susann','Susanna','Susannah','Susanne','Susette','Sushil','Susie','Suzan','Suzann','Suzanna','Suzanne','Suzette','Suzie','Suzy','Sven','Svetlana','Swati','Sybil','Sydney','Syed','Sylvain','Sylvester','Sylvia','Sylvie','Sylwia','Tabatha','Tabitha','Tad','Tadd','Tadeusz','Tae','Tai','Tak','Takashi','Tal','Talia','Talin','Tam','Tama','Tamar','Tamara','Tamatha','Tameka','Tamela','Tamera','Tami','Tamie','Tamika','Tammi','Tammie','Tammy','Tamra','Tan','Tana','Tania','Tanisha','Tanja','Tanner','Tanya','Tao','Tara','Tarek','Tari','Tariq','Tarun','Taryn','Tasha','Tate','Tatiana','Tatum','Tatyana','Taunya','Tawny','Tawnya','Taylor','Ted','Tedd','Teddy','Teena','Tena','Teodora','Teodoro','Teofilo','Tera','Terence','Teresa','Terese','Teresita','Teressa','Teri','Terra','Terrance','Terrell','Terrence','Terri','Terrie','Terrill','Terry','Teryl','Tessa','Tetyana','Thad','Thaddeus','Thai','Thang','Thanh','Thao','Thea','Thelma','Theo','Theodora','Theodore','Theresa','Therese','Theron','Thi','Thien','Thierry','Thinh','Tho','Thomas','Thong','Thor','Thu','Thuan','Thuc','Thurman','Thuy','Tia','Tian','Tibor','Tien','Tiffani','Tiffanie','Tiffany','Tim','Timmy','Timothy','Tin','Tina','Ting','Tinh','Tisha','Tito','Titus','Toan','Tobias','Tobin','Toby','Tod','Todd','Tom','Tomas','Tomasz','Tomeka','Tomi','Tomislav','Tommie','Tommy','Tong','Toni','Tonia','Tonja','Tony','Tonya','Tori','Torrey','Tory','Tosha','Trace','Tracee','Tracey','Traci','Tracie','Tracy','Tram','Tran','Trang','Travis','Trena','Trent','Trenton','Tresa','Tressa','Treva','Trevor','Trey','Tri','Tricia','Trina','Trinh','Trinidad','Trinity','Trish','Trisha','Trista','Tristan','Trong','Troy','Truc','Trudi','Trudie','Trudy','Truman','Trung','Truong','Tu','Tuan','Tucker','Tung','Tushar','Tuyen','Tuyet','Twila','Twyla','Ty','Tye','Tyler','Tyra','Tyrone','Tyson','Tzvi','Ubaldo','Uday','Udo','Ulises','Ulrike','Ulysses','Uma','Umesh','Uriel','Ursula','Urszula','Usha','Ut','Ute','Uwe','Vadim','Vahan','Vahe','Vahik','Vaishali','Val','Valarie','Valentin','Valentina','Valentine','Valeri','Valeria','Valerie','Valeriy','Valery','Valorie','Van','Vance','Vandana','Vanessa','Varsha','Vasile','Vasiliki','Vasilios','Vasiliy','Vasyl','Vaughn','Veena','Velma','Venessa','Venkat','Venkata','Venkatesh','Venus','Vera','Vern','Verna','Verne','Vernon','Veronica','Veronika','Veronique','Vicente','Vickey','Vicki','Vickie','Vicky','Victor','Victoria','Vida','Vidal','Vidya','Vien','Viet','Vijay','Vijaya','Vikas','Viki','Vikki','Vikram','Viktor','Vilma','Vinay','Vince','Vincent','Vincenza','Vincenzo','Vinh','Vinod','Viola','Violet','Violeta','Violetta','Vipul','Virgil','Virgilio','Virgina','Virginia','Vishal','Vita','Vitaliy','Vitaly','Vito','Vivek','Vivian','Viviana','Vivien','Vladimir','Vladislav','Volodymyr','Von','Vonda','Vu','Vyacheslav','Wade','Wai','Waldemar','Walid','Walker','Wallace','Wally','Walt','Walter','Waltraud','Wan','Wanda','Wang','Ward','Warner','Warren','Wayne','Wei','Weidong','Weimin','Weiming','Weiping','Weldon','Wen','Wende','Wendee','Wendell','Wendi','Wendie','Wendy','Werner','Wes','Wesley','Weston','Whitney','Wieslaw','Wieslawa','Wilbert','Wilbur','Wilburn','Wilda','Wiley','Wilford','Wilfred','Wilfredo','Wilhelmina','Will','Willa','Willard','William','Willie','Willis','Willy','Wilma','Wilmer','Wilson','Windy','Wing','Winifred','Winnie','Winona','Winston','Witold','Wojciech','Wolfgang','Won','Woo','Woodrow','Woon','Wyatt','Wynne','Xavier','Xi','Xia','Xian','Xiang','Xiao','Xiaodong','Xiaofeng','Xiaohong','Xiaoping','Xin','Xing','Xiomara','Xiong','Xiu','Xochitl','Xu','Xuan','Xue','Xuejun','Xun','Yadira','Yakov','Yan','Yana','Yanet','Yang','Yao','Yaron','Yasmin','Ye','Yee','Yefim','Yelena','Yen','Yesenia','Yevgeniy','Yevgeniya','Yi','Yin','Ying','Yiu','Yogesh','Yoko','Yolanda','Yong','Yoon','Yoshiko','Young','Youssef','Yu','Yuan','Yue','Yuk','Yulia','Yuliya','Yun','Yung','Yuri','Yuriy','Yves','Yvette','Yvonne','Zach','Zachariah','Zachary','Zachery','Zack','Zahra','Zane','Zbigniew','Zdzislaw','Zeljko','Zenaida','Zenon','Zhanna','Zhao','Zhe','Zhen','Zheng','Zhi','Zhigang','Zhiqiang','Zhiyong','Zhong','Zhuo','Zi','Zina','Zoe','Zofia','Zoila','Zoltan','Zoran'];

document.onload = do_when_page_loaded();




